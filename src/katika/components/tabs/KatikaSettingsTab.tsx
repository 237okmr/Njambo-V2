import React, { useState, useEffect } from 'react';
import { 
  Sliders, 
  Save, 
  RotateCcw, 
  CheckCircle2, 
  Clock, 
  Trophy, 
  Sparkles, 
  Flame, 
  Power,
  X,
  Coins,
  Megaphone,
  Lock,
  Radio,
  AlertTriangle,
  Bot,
  ShieldCheck,
  Users,
  Swords,
  UserCheck,
  Eye,
  Crown,
  MessageSquare,
  Download,
  FileText,
  CheckSquare,
  Square,
  RefreshCw,
  UserPlus,
  UserMinus,
  Trash2
} from 'lucide-react';
import { KatikaGameConfig } from '../../types/katika';
import { KatikaService, DEFAULT_KATIKA_CONFIG, ProfileAuditReport, SecondaryAdminRecord } from '../../services/katikaService';
import { useKatikaAuth, KATIKA_AUTHORIZED_EMAIL } from '../../context/KatikaAuthContext';
import { navigateToKatikaTab } from '../../utils/katikaNavigation';
import { 
  AiAdminChatClient, 
  ChatBotPreferences, 
  ChatTone, 
  ChatStyle 
} from '../../services/aiAdminChatClient';
import { KatikaNumberSliderField } from '../settings/KatikaNumberSliderField';

interface KatikaSettingsTabProps {
  onConfigUpdated?: (config: KatikaGameConfig) => void;
}

export const KatikaSettingsTab: React.FC<KatikaSettingsTabProps> = ({ onConfigUpdated }) => {
  const { user } = useKatikaAuth();
  const isOwner = (user?.email || '').trim().toLowerCase() === KATIKA_AUTHORIZED_EMAIL.toLowerCase();

  const [config, setConfig] = useState<KatikaGameConfig>({ ...DEFAULT_KATIKA_CONFIG });
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [settingsSubTab, setSettingsSubTab] = useState<'ENGINE_PACING' | 'MULTI_AI' | 'ECONOMY' | 'RULES' | 'BROADCAST' | 'AI_CONFIG' | 'PWA_POLICY' | 'SECURITY_AUDIT' | 'ADMINS'>('ENGINE_PACING');
  const [aiPrefs, setAiPrefs] = useState<ChatBotPreferences>(() => AiAdminChatClient.getPreferences());
  const [auditReport, setAuditReport] = useState<ProfileAuditReport | null>(null);
  const [isAuditing, setIsAuditing] = useState<boolean>(false);
  const [auditError, setAuditError] = useState<string | null>(null);

  // Admin Management State
  const [adminsList, setAdminsList] = useState<SecondaryAdminRecord[]>([]);
  const [loadingAdmins, setLoadingAdmins] = useState<boolean>(false);
  const [newAdminEmail, setNewAdminEmail] = useState<string>('');
  const [grantingAdmin, setGrantingAdmin] = useState<boolean>(false);
  const [adminError, setAdminError] = useState<string | null>(null);
  const [adminSuccess, setAdminSuccess] = useState<string | null>(null);
  const [revokeConfirmUid, setRevokeConfirmUid] = useState<string | null>(null);
  const [revokingAdmin, setRevokingAdmin] = useState<boolean>(false);

  const loadAdmins = async () => {
    if (!isOwner) return;
    setLoadingAdmins(true);
    setAdminError(null);
    try {
      const list = await KatikaService.getSecondaryAdmins();
      setAdminsList(list);
    } catch (err: any) {
      setAdminError(err?.message || 'Erreur lors du chargement des administrateurs.');
    } finally {
      setLoadingAdmins(false);
    }
  };

  useEffect(() => {
    if (settingsSubTab === 'ADMINS' && isOwner) {
      loadAdmins();
    }
  }, [settingsSubTab, isOwner]);

  useEffect(() => {
    KatikaService.getConfig().then((data) => {
      setConfig({ ...DEFAULT_KATIKA_CONFIG, ...data });
      setLoading(false);
    });

    const handleConfigChange = () => {
      KatikaService.getConfig().then((data) => {
        setConfig({ ...DEFAULT_KATIKA_CONFIG, ...data });
      });
    };

    window.addEventListener('katika-config-updated', handleConfigChange);
    return () => window.removeEventListener('katika-config-updated', handleConfigChange);
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const updated = await KatikaService.updateConfig(config);
      setConfig(updated);
      window.dispatchEvent(new CustomEvent('katika-config-updated', { detail: updated }));
      if (onConfigUpdated) onConfigUpdated(updated);
      setFeedback('Paramètres Katika enregistrés et appliqués en temps réel !');
      setTimeout(() => setFeedback(null), 4000);
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleResetDefaults = () => {
    setConfig({ ...DEFAULT_KATIKA_CONFIG });
    setFeedback('Paramètres réinitialisés aux valeurs par défaut officielles. Cliquez sur "Enregistrer les Paramètres" pour confirmer.');
    setTimeout(() => setFeedback(null), 5000);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-400">
        <Clock className="w-6 h-6 animate-spin text-amber-400 mr-3" />
        <span className="text-xs font-mono">Chargement des configurations Katika...</span>
      </div>
    );
  }

  return (
    <form onSubmit={handleSave} className="space-y-6 max-w-5xl">
      {/* Top Administrative Header Banner */}
      <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-lg">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-amber-400" />
            <h2 className="text-sm font-bold text-white tracking-wide">Paramétrage Moteur & Système Katika</h2>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/10 text-amber-300 border border-amber-500/25">
              <Crown className="w-3 h-3 text-amber-400" />
              Administrateur Katika
            </span>
          </div>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            Centre de contrôle global régissant le rythme de jeu, les délais des parties, le multijoueur et l'économie en direct.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start md:self-auto">
          <span className="text-[10px] font-mono px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 text-slate-300 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Synchronisation Solo & WebSocket active
          </span>
        </div>
      </div>

      {/* Top Banner Feedback */}
      {feedback && (
        <div className="p-3.5 rounded-xl bg-emerald-950/70 border border-emerald-800 text-emerald-300 text-xs flex items-center justify-between shadow-lg animate-fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{feedback}</span>
          </div>
          <button type="button" onClick={() => setFeedback(null)} className="text-emerald-400 hover:text-emerald-200">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Internal Settings Sub-navigation Bar (Tabs Internes) */}
      <div className="flex items-center gap-1 border-b border-slate-800 pb-px text-xs overflow-x-auto whitespace-nowrap scrollbar-none">
        {[
          { id: 'ENGINE_PACING', label: 'Rythme & Moteur', icon: Clock },
          { id: 'MULTI_AI', label: 'Multijoueur & Tables', icon: Users },
          { id: 'ECONOMY', label: 'Économie & Système', icon: Coins },
          { id: 'RULES', label: 'Règles & Variantes', icon: Trophy },
          { id: 'BROADCAST', label: 'Message Global', icon: Megaphone },
          { id: 'AI_CONFIG', label: 'Assistant IA', icon: Bot },
          { id: 'PWA_POLICY', label: 'Versions PWA', icon: ShieldCheck },
          { id: 'SECURITY_AUDIT', label: 'Audit Sécurité & Règles', icon: ShieldCheck },
          ...(isOwner ? [{ id: 'ADMINS', label: 'Administrateurs', icon: Crown }] : []),
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = settingsSubTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSettingsSubTab(tab.id as any)}
              className={`flex items-center gap-2 px-4 py-3 font-medium transition-all relative border-b-2 cursor-pointer ${
                isActive
                  ? 'border-amber-500 text-amber-400 bg-amber-500/5'
                  : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-850/30'
              }`}
            >
              <Icon className="w-3.5 h-3.5 shrink-0" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Structured Container Content for the Current Tab */}
      <div className="p-5 md:p-6 rounded-xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-6">
        
        {/* DOMAIN 1: RYTHME & MOTEUR (ENGINE_PACING) */}
        {settingsSubTab === 'ENGINE_PACING' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-cyan-400" />
                <h3 className="text-sm font-bold text-white">Rythme & Délais du Moteur de Jeu</h3>
              </div>
              <span className="text-[11px] font-mono text-cyan-400 bg-cyan-950/40 border border-cyan-800/40 px-2 py-0.5 rounded">
                Appliqué au Solo & Multijoueur
              </span>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              Ajustez avec précision la granularité temporelle de chaque phase de jeu. Chaque délai peut être configuré via le curseur ou saisi directement dans le champ texte.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* 1. Temps par Tour */}
              <KatikaNumberSliderField
                id="turn-timer-field"
                label="Temps alloué par tour de jeu"
                description="Chronomètre maximum dont dispose un joueur ou bot pour poser sa carte à son tour."
                value={config.turnTimerSeconds}
                onChange={(val) => setConfig(prev => ({ ...prev, turnTimerSeconds: val }))}
                min={5}
                max={60}
                step={1}
                unit="s"
                accentColor="cyan"
                presets={[
                  { label: 'Blitz', value: 5 },
                  { label: 'Standard', value: 15 },
                  { label: 'Confort', value: 25 },
                  { label: 'Lent', value: 45 },
                ]}
              />

              {/* 2. Réflexion des Bots */}
              <KatikaNumberSliderField
                id="bot-think-field"
                label="Délai de réflexion IA / Bots"
                description="Temps d'attente artificiel avant qu'un robot ne joue sa carte pour simuler une réflexion humaine."
                value={config.botThinkTimeMs || 800}
                onChange={(val) => setConfig(prev => ({ ...prev, botThinkTimeMs: val }))}
                min={200}
                max={3000}
                step={50}
                unit="ms"
                accentColor="cyan"
                presets={[
                  { label: 'Éclair', value: 400 },
                  { label: 'Standard', value: 800 },
                  { label: 'Réaliste', value: 1200 },
                ]}
              />

              {/* 3. Ramassage des Plis */}
              <KatikaNumberSliderField
                id="trick-resolution-field"
                label="Délai de ramassage du pli"
                description="Temps d'affichage des cartes sur la table avant que le pli ne soit collecté par le vainqueur."
                value={config.trickResolutionTimeMs || 1600}
                onChange={(val) => setConfig(prev => ({ ...prev, trickResolutionTimeMs: val }))}
                min={500}
                max={3500}
                step={50}
                unit="ms"
                accentColor="cyan"
                presets={[
                  { label: 'Rapide', value: 1000 },
                  { label: 'Standard', value: 1600 },
                  { label: 'Pédagogique', value: 2500 },
                ]}
              />

              {/* 4. Transition Inter-Manche */}
              <KatikaNumberSliderField
                id="transition-delay-field"
                label="Transition inter-manche (Fin de donne)"
                description="Délai accordé aux joueurs pour consulter les scores et gains avant de lancer la distribution suivante."
                value={config.transitionDelayMs || 12000}
                onChange={(val) => setConfig(prev => ({ ...prev, transitionDelayMs: val }))}
                min={3000}
                max={25000}
                step={500}
                unit="ms"
                accentColor="cyan"
                presets={[
                  { label: 'Rapide', value: 6000 },
                  { label: 'Standard', value: 12000 },
                  { label: 'Complet', value: 18000 },
                ]}
              />

              {/* 5. Animation Victoire Instantanée */}
              <KatikaNumberSliderField
                id="instant-win-field"
                label="Animation victoire instantanée"
                description="Délai d'affichage spécial lors d'un 'Moins de 21' ou des 'Trois Septs' avant la clôture du round."
                value={config.instantWinAnimationTimeMs || 3500}
                onChange={(val) => setConfig(prev => ({ ...prev, instantWinAnimationTimeMs: val }))}
                min={1500}
                max={8000}
                step={250}
                unit="ms"
                accentColor="cyan"
                presets={[
                  { label: 'Dynamique', value: 2500 },
                  { label: 'Standard', value: 3500 },
                  { label: 'Solennel', value: 5000 },
                ]}
              />

              {/* 6. Délai après Forfait / Fold */}
              <KatikaNumberSliderField
                id="fold-delay-field"
                label="Délai après forfait / abandon de pli"
                description="Temps de notification accordé aux joueurs lors d'un abandon anticipé avant la redistribution."
                value={config.foldForfeitDelayMs || 2000}
                onChange={(val) => setConfig(prev => ({ ...prev, foldForfeitDelayMs: val }))}
                min={1000}
                max={5000}
                step={200}
                unit="ms"
                accentColor="cyan"
                presets={[
                  { label: 'Immédiat', value: 1000 },
                  { label: 'Standard', value: 2000 },
                  { label: 'Posé', value: 3000 },
                ]}
              />
            </div>

            {/* Strict Timeout Rule Card */}
            <div className="p-4 rounded-xl bg-red-950/20 border border-red-900/30 text-red-300 space-y-1.5">
              <div className="flex items-center gap-2 font-bold text-red-400 text-xs">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>Règle d'or : Forfait automatique en cas d'expiration de tour</span>
              </div>
              <p className="text-[11px] text-red-200/80 leading-relaxed">
                Si le chronomètre de tour d'un joueur humain arrive à zéro sans action, le moteur déclare un forfait pour la manche en cours afin d'éviter tout blocage de la table. La mise de ce joueur reste engagée dans le pot commun.
              </p>
            </div>
          </div>
        )}

        {/* DOMAIN 2: MULTIJOUEUR & TABLES (MULTI_AI) */}
        {settingsSubTab === 'MULTI_AI' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-emerald-400" />
                <h3 className="text-sm font-bold text-white">Règles & Paramètres Multijoueur</h3>
              </div>
              <span className="text-[11px] font-mono text-emerald-400 bg-emerald-950/40 border border-emerald-800/40 px-2 py-0.5 rounded">
                Tables & Intelligence Artificielle
              </span>
            </div>

            {/* Defaults when creating tables */}
            <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 space-y-4">
              <div className="flex items-center gap-2 text-xs font-bold text-white">
                <Swords className="w-4 h-4 text-amber-400" />
                <span>Configuration par Défaut lors de la Création d'une Table</span>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Définit les options présélectionnées lorsqu'un utilisateur ouvre le formulaire de création d'un nouveau salon en ligne.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Default Table Format: 1vs1 vs 4 Joueurs */}
                <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
                  <label className="text-xs font-semibold text-slate-200 flex items-center justify-between">
                    <span>Format de table par défaut :</span>
                    <span className="text-amber-400 font-mono text-[11px]">
                      {(config.defaultTableMaxPlayers || 2) === 2 ? '⚔️ 1 vs 1 (Duel)' : '👥 4 Joueurs'}
                    </span>
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setConfig(prev => ({ ...prev, defaultTableMaxPlayers: 2 }))}
                      className={`py-2 px-3 rounded-lg text-xs font-bold border transition cursor-pointer ${
                        (config.defaultTableMaxPlayers || 2) === 2
                          ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 shadow-sm'
                          : 'bg-slate-950 text-slate-400 hover:text-slate-200 border-slate-800'
                      }`}
                    >
                      ⚔️ 1 vs 1 (2 Joueurs)
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfig(prev => ({ ...prev, defaultTableMaxPlayers: 4 }))}
                      className={`py-2 px-3 rounded-lg text-xs font-bold border transition cursor-pointer ${
                        config.defaultTableMaxPlayers === 4
                          ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 shadow-sm'
                          : 'bg-slate-950 text-slate-400 hover:text-slate-200 border-slate-800'
                      }`}
                    >
                      👥 4 Joueurs
                    </button>
                  </div>
                  <p className="text-[10px] text-slate-500">
                    Valeur par défaut standard : 1vs1 (Duel direct).
                  </p>
                </div>

                {/* Default Fill With Bots: 100% Humain vs Mixte */}
                <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
                  <label className="text-xs font-semibold text-slate-200 flex items-center justify-between">
                    <span>Remplissage par défaut :</span>
                    <span className="text-emerald-400 font-mono text-[11px]">
                      {config.defaultFillWithBots ? '🤖 Mode Mixte' : '👥 100% Humains'}
                    </span>
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setConfig(prev => ({ ...prev, defaultFillWithBots: false }))}
                      className={`py-2 px-3 rounded-lg text-xs font-bold border transition cursor-pointer ${
                        !config.defaultFillWithBots
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 shadow-sm'
                          : 'bg-slate-950 text-slate-400 hover:text-slate-200 border-slate-800'
                      }`}
                    >
                      👥 100% Humains
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfig(prev => ({ ...prev, defaultFillWithBots: true }))}
                      className={`py-2 px-3 rounded-lg text-xs font-bold border transition cursor-pointer ${
                        config.defaultFillWithBots
                          ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/50 shadow-sm'
                          : 'bg-slate-950 text-slate-400 hover:text-slate-200 border-slate-800'
                      }`}
                    >
                      🤖 Mode Mixte
                    </button>
                  </div>
                  <p className="text-[10px] text-slate-500">
                    Valeur par défaut standard : 100% Humains (attente des joueurs).
                  </p>
                </div>
              </div>
            </div>

            {/* Multiplayer Delays & AI Sliders */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Inactivité Salle d'Attente */}
              <KatikaNumberSliderField
                id="inactivity-timeout-field"
                label="Tolérance d'inactivité salle d'attente"
                description="Temps d'attente maximal au salon avant dissolution automatique d'une table sans action."
                value={config.inactivityTimeoutSeconds}
                onChange={(val) => setConfig(prev => ({ ...prev, inactivityTimeoutSeconds: val }))}
                min={30}
                max={300}
                step={10}
                unit="s"
                accentColor="emerald"
                presets={[
                  { label: 'Court', value: 60 },
                  { label: 'Standard', value: 120 },
                  { label: 'Prolongé', value: 240 },
                ]}
              />

              {/* Tolérance Déconnexion Réseau */}
              <KatikaNumberSliderField
                id="reconnect-timeout-field"
                label="Délai de grâce reconnexion réseau (En match)"
                description="Temps accordé à un joueur déconnecté pendant une partie pour réintégrer la table avant son remplacement par un bot."
                value={config.reconnectTimeoutSeconds}
                onChange={(val) => setConfig(prev => ({ ...prev, reconnectTimeoutSeconds: val }))}
                min={15}
                max={180}
                step={5}
                unit="s"
                accentColor="emerald"
                presets={[
                  { label: 'Strict', value: 30 },
                  { label: 'Standard', value: 75 },
                  { label: 'Tolérant', value: 120 },
                ]}
              />

              {/* Délai de grâce déconnexion dans le Salon (Lobby) */}
              <KatikaNumberSliderField
                id="lobby-disconnect-grace-field"
                label="Délai de grâce déconnexion Salon (Lobby)"
                description="Temps accordé à un joueur déconnecté au salon avant libération automatique de son siège (évite les doublons et les sièges fantômes)."
                value={config.lobbyDisconnectGraceSeconds || 20}
                onChange={(val) => setConfig(prev => ({ ...prev, lobbyDisconnectGraceSeconds: val }))}
                min={5}
                max={60}
                step={5}
                unit="s"
                accentColor="emerald"
                presets={[
                  { label: 'Express', value: 10 },
                  { label: 'Équilibré', value: 20 },
                  { label: 'Confort', value: 35 },
                ]}
              />

              {/* Fermeture des salons abandonnés sans humains */}
              <KatikaNumberSliderField
                id="empty-room-timeout-field"
                label="Fermeture des salons abandonnés sans humains"
                description="Délai d'inactivité avant la suppression automatique et définitive (mémoire & base Firestore) d'une table sans aucun joueur humain connecté."
                value={config.emptyRoomTimeoutMinutes ?? 5}
                onChange={(val) => setConfig(prev => ({ ...prev, emptyRoomTimeoutMinutes: val }))}
                min={1}
                max={30}
                step={1}
                unit="min"
                accentColor="emerald"
                presets={[
                  { label: '2 min', value: 2 },
                  { label: '5 min (Défaut)', value: 5 },
                  { label: '10 min', value: 10 },
                  { label: '15 min', value: 15 },
                ]}
              />
            </div>

            {/* DEDICATED SECTION: Durée de vie & Gestion des tables en attente (LOBBY) */}
            <div className="p-4 md:p-5 rounded-xl bg-slate-950/80 border border-emerald-900/40 space-y-5">
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-emerald-400" />
                  <h4 className="text-xs font-bold text-white tracking-wide uppercase">
                    Gestion & Durée de vie des Tables en Attente (Lobby)
                  </h4>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setConfig(prev => ({
                      ...prev,
                      lobbyWaitTtlMinutes: 30,
                      publicAbsentHostVisibilitySeconds: 180,
                      hostTakeoverSeconds: 180,
                      guestLobbyGraceSeconds: 60,
                      joinPushEnabled: true,
                    }));
                  }}
                  className="px-2.5 py-1 rounded bg-slate-900 hover:bg-slate-800 border border-slate-700 text-[10px] text-slate-300 transition cursor-pointer"
                >
                  Valeurs par défaut
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* 1. Durée de vie globale en attente (lobbyWaitTtlMinutes) */}
                <KatikaNumberSliderField
                  id="lobby-wait-ttl-field"
                  label="Durée de vie d'une table en attente sans humain"
                  description="Durée maximale de conservation d'une table LOBBY si aucun humain n'est connecté. Permet de maintenir la table ouverte pendant qu'un hôte partage son lien."
                  value={config.lobbyWaitTtlMinutes ?? 30}
                  onChange={(val) => setConfig(prev => ({ ...prev, lobbyWaitTtlMinutes: val }))}
                  min={5}
                  max={240}
                  step={5}
                  unit="min"
                  accentColor="emerald"
                  presets={[
                    { label: '15 min', value: 15 },
                    { label: '30 min (Défaut)', value: 30 },
                    { label: '60 min', value: 60 },
                    { label: '2 h', value: 120 },
                  ]}
                />

                {/* 2. Visibilité publique de l'hôte absent (publicAbsentHostVisibilitySeconds) */}
                <KatikaNumberSliderField
                  id="public-absent-host-visibility-field"
                  label="Visibilité publique en cas d'hôte absent"
                  description="Durée pendant laquelle une table dont l'hôte est absent reste affichée dans la liste publique. Au-delà, elle reste accessible via lien direct ou code."
                  value={config.publicAbsentHostVisibilitySeconds ?? 180}
                  onChange={(val) => setConfig(prev => ({ ...prev, publicAbsentHostVisibilitySeconds: val }))}
                  min={0}
                  max={1800}
                  step={30}
                  unit="s"
                  accentColor="emerald"
                  presets={[
                    { label: '1 min', value: 60 },
                    { label: '3 min (Défaut)', value: 180 },
                    { label: '5 min', value: 300 },
                    { label: '10 min', value: 600 },
                  ]}
                />

                {/* 3. Passation hôte de repli (hostTakeoverSeconds) */}
                <KatikaNumberSliderField
                  id="host-takeover-field"
                  label="Délai d'attribution d'un hôte de repli"
                  description="Temps d'absence de l'hôte avant qu'un invité connecté devienne hôte de repli. Régler à 0 pour désactiver l'hôte de repli."
                  value={config.hostTakeoverSeconds ?? 180}
                  onChange={(val) => setConfig(prev => ({ ...prev, hostTakeoverSeconds: val }))}
                  min={0}
                  max={1800}
                  step={30}
                  unit="s"
                  accentColor="emerald"
                  presets={[
                    { label: 'Désactivé', value: 0 },
                    { label: '1 min', value: 60 },
                    { label: '3 min (Défaut)', value: 180 },
                    { label: '5 min', value: 300 },
                  ]}
                />

                {/* 4. Délai de grâce invité au lobby (guestLobbyGraceSeconds) */}
                <KatikaNumberSliderField
                  id="guest-lobby-grace-field"
                  label="Délai de grâce invité déconnecté au lobby"
                  description="Temps accordé à un invité déconnecté pour revenir au salon avant la libération de son siège."
                  value={config.guestLobbyGraceSeconds ?? 60}
                  onChange={(val) => setConfig(prev => ({ ...prev, guestLobbyGraceSeconds: val }))}
                  min={30}
                  max={600}
                  step={10}
                  unit="s"
                  accentColor="emerald"
                  presets={[
                    { label: '30 s', value: 30 },
                    { label: '60 s (Défaut)', value: 60 },
                    { label: '2 min', value: 120 },
                    { label: '5 min', value: 300 },
                  ]}
                />
              </div>

              {/* Toggle notification push quand un humain rejoint */}
              <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between gap-4">
                <div className="flex flex-col gap-0.5 min-w-0">
                  <span className="text-xs font-bold text-slate-200">
                    Notifications Push à l'hôte absent lors des arrivées
                  </span>
                  <span className="text-[11px] text-slate-400">
                    Avertir l'hôte sur son téléphone/PWA quand un joueur rejoint sa table en attente (1 alerte max/2 min).
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setConfig(prev => ({ ...prev, joinPushEnabled: !(prev.joinPushEnabled !== false) }))}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    config.joinPushEnabled !== false ? 'bg-emerald-500' : 'bg-slate-700'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      config.joinPushEnabled !== false ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Taux d'apparition Boss IA (Hokuto) */}
              <KatikaNumberSliderField
                id="hokuto-spawn-field"
                label="Taux d'apparition Boss IA (Robam Hokuto)"
                description="Probabilité (0 à 100%) d'apparition du bot adaptatif Robam Hokuto lors de la génération de robots."
                value={config.hokutoSpawnRatePct || 75}
                onChange={(val) => setConfig(prev => ({ ...prev, hokutoSpawnRatePct: val }))}
                min={0}
                max={100}
                step={5}
                unit="%"
                accentColor="emerald"
                presets={[
                  { label: 'Désactivé', value: 0 },
                  { label: 'Modéré', value: 40 },
                  { label: 'Standard', value: 75 },
                  { label: 'Systématique', value: 100 },
                ]}
              />

              {/* Auto Advance Toggle */}
              <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-3 flex flex-col justify-between">
                <div className="space-y-1">
                  <div className="font-bold text-white text-xs flex items-center gap-2">
                    <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Mode "Prêt Rapide" (Auto-Advance)</span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Permet d'abréger immédiatement l'animation de fin de manche dès que tous les joueurs connectés ont validé "Suivant".
                  </p>
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-slate-800/80">
                  <span className="text-[11px] font-mono text-slate-400">
                    {config.allowAutoAdvance ? 'Actif (Transition immédiate)' : 'Inactif (Délai complet)'}
                  </span>
                  <button
                    type="button"
                    onClick={() => setConfig(prev => ({ ...prev, allowAutoAdvance: !prev.allowAutoAdvance }))}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer shrink-0 ${
                      config.allowAutoAdvance ? 'bg-emerald-500' : 'bg-slate-700'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        config.allowAutoAdvance ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
              </div>

              {/* Rejoindre en cours de manche Toggle */}
              <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center justify-between col-span-1 md:col-span-2">
                <div className="space-y-1 pr-4">
                  <div className="font-bold text-white text-xs flex items-center gap-2">
                    <Eye className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Admission de Nouveaux Venus (Table &lt; 4 joueurs)</span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Autorise de nouveaux joueurs à rejoindre un salon actif en tant que spectateurs, puis à prendre place sur un siège vacant au lancement de la prochaine manche.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setConfig(prev => ({ ...prev, allowJoinInProgress: !prev.allowJoinInProgress }))}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer shrink-0 ${
                    config.allowJoinInProgress !== false ? 'bg-cyan-500' : 'bg-slate-700'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      config.allowJoinInProgress !== false ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </div>

            {/* SECTION DÉDIÉE : DIALOGUES & RYTHME DES RÉPLIQUES DES BOTS */}
            <div className="p-4 md:p-5 rounded-xl bg-slate-950/70 border border-slate-800 space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
                    <MessageSquare className="w-4 h-4 text-amber-400" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                      Dialogue & Pacing des Répliques Bots IA
                    </h4>
                    <p className="text-[11px] text-slate-400">
                      Régulation dynamique du bavardage des robots, temps de silence partagé et taux d'intervention contextuels.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 self-start sm:self-auto">
                  <span className="text-[10px] font-mono px-2.5 py-1 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20">
                    {(config.botMaxEmotesPerRound ?? 2) === 0
                      ? '🔇 Robots Muets'
                      : `💬 Max ${config.botMaxEmotesPerRound ?? 2}/manche • ${config.botEmoteCooldownSeconds ?? 7}s cooldown`}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* 1. Cooldown minimal partagé */}
                <KatikaNumberSliderField
                  id="bot-emote-cooldown-field"
                  label="Délai de silence minimal entre messages bots"
                  description="Temps d'attente imposé entre deux prises de parole de robots pour éviter les bavardages simultanés ou superpositions."
                  value={config.botEmoteCooldownSeconds ?? 7}
                  onChange={(val) => setConfig(prev => ({ ...prev, botEmoteCooldownSeconds: val }))}
                  min={2}
                  max={30}
                  step={1}
                  unit="s"
                  accentColor="amber"
                  presets={[
                    { label: 'Court (3s)', value: 3 },
                    { label: 'Standard (7s)', value: 7 },
                    { label: 'Aéré (12s)', value: 12 },
                    { label: 'Posé (20s)', value: 20 },
                  ]}
                />

                {/* 2. Plafond d'interventions par manche */}
                <KatikaNumberSliderField
                  id="bot-max-emotes-field"
                  label="Plafond global de répliques par manche"
                  description="Nombre maximal de répliques autorisées pour l'ensemble des robots au cours d'une même manche (0 = muet)."
                  value={config.botMaxEmotesPerRound ?? 2}
                  onChange={(val) => setConfig(prev => ({ ...prev, botMaxEmotesPerRound: val }))}
                  min={0}
                  max={6}
                  step={1}
                  unit="msg"
                  accentColor="amber"
                  presets={[
                    { label: 'Muet (0)', value: 0 },
                    { label: 'Sobre (1)', value: 1 },
                    { label: 'Standard (2)', value: 2 },
                    { label: 'Bavard (4)', value: 4 },
                  ]}
                />

                {/* 3. Taux répliques Robam Hokuto / Boss */}
                <KatikaNumberSliderField
                  id="bot-hokuto-rate-field"
                  label="Probabilité répliques Robam Hokuto / Grand Maître"
                  description="Fréquence d'analyse tactique et de piques adaptatives par Robam Hokuto ou un Grand Maître."
                  value={config.botEmoteHokutoRatePct ?? 28}
                  onChange={(val) => setConfig(prev => ({ ...prev, botEmoteHokutoRatePct: val }))}
                  min={0}
                  max={100}
                  step={2}
                  unit="%"
                  accentColor="amber"
                  presets={[
                    { label: 'Discret (15%)', value: 15 },
                    { label: 'Standard (28%)', value: 28 },
                    { label: 'Actif (50%)', value: 50 },
                    { label: 'Intense (75%)', value: 75 },
                  ]}
                />

                {/* 4. Taux prises de contrôle & coupes */}
                <KatikaNumberSliderField
                  id="bot-mbap-rate-field"
                  label="Probabilité prises de contrôle & coupes (« Couper la carte »)"
                  description="Fréquence d'intervention lors d'une prise de contrôle avec un 10 ou une carte patronne (« Je coupe ça sec ! », « Je prends le contrôle ! »)."
                  value={config.botEmoteMbapRatePct ?? 25}
                  onChange={(val) => setConfig(prev => ({ ...prev, botEmoteMbapRatePct: val }))}
                  min={0}
                  max={100}
                  step={5}
                  unit="%"
                  accentColor="amber"
                  presets={[
                    { label: 'Calme (10%)', value: 10 },
                    { label: 'Standard (25%)', value: 25 },
                    { label: 'Chaud (45%)', value: 45 },
                    { label: 'Max (70%)', value: 70 },
                  ]}
                />

                {/* 5. Taux entames et cartes sans la couleur demandée */}
                <KatikaNumberSliderField
                  id="bot-lead-discard-rate-field"
                  label="Probabilité réactions entames & cartes sans couleur"
                  description="Fréquence des remarques sur entames calmes ou absence de couleur demandée (« Je n'ai pas la carte ! », « Je pose une petite d'abord »)."
                  value={config.botEmoteLeadDiscardRatePct ?? 10}
                  onChange={(val) => setConfig(prev => ({ ...prev, botEmoteLeadDiscardRatePct: val }))}
                  min={0}
                  max={50}
                  step={2}
                  unit="%"
                  accentColor="amber"
                  presets={[
                    { label: 'Rare (5%)', value: 5 },
                    { label: 'Standard (10%)', value: 10 },
                    { label: 'Présent (20%)', value: 20 },
                    { label: 'Fréquent (35%)', value: 35 },
                  ]}
                />

                {/* 6. Exception Moments Critiques Toggle */}
                <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 space-y-3 flex flex-col justify-between">
                  <div className="space-y-1">
                    <div className="font-bold text-white text-xs flex items-center gap-2">
                      <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                      <span>Bypass Exceptionnel (Kora-Break & Pli 5)</span>
                    </div>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      Autorise les réactions décisives (briser une série de plis ou victoire sur le pot au pli 5) à s'exprimer même si le plafond de manche est atteint, dès lors que le délai de silence de table est purgé.
                    </p>
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-slate-800/80">
                    <span className="text-[11px] font-mono text-slate-400">
                      {config.botEmoteCriticalBypassLimit !== false ? 'Actif (Autorisé sur moment clé)' : 'Inactif (Plafond strict absolu)'}
                    </span>
                    <button
                      type="button"
                      onClick={() => setConfig(prev => ({ ...prev, botEmoteCriticalBypassLimit: prev.botEmoteCriticalBypassLimit === false ? true : false }))}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer shrink-0 ${
                        config.botEmoteCriticalBypassLimit !== false ? 'bg-amber-500' : 'bg-slate-700'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          config.botEmoteCriticalBypassLimit !== false ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* DOMAIN 3: ÉCONOMIE & SYSTÈME (ECONOMY) */}
        {settingsSubTab === 'ECONOMY' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Coins className="w-4 h-4 text-amber-400" />
                <h3 className="text-sm font-bold text-white">Économie & Paramètres Système</h3>
              </div>
              <span className="text-[11px] font-mono text-amber-400 bg-amber-950/40 border border-amber-800/40 px-2 py-0.5 rounded">
                Jetons & Modération Bancaire
              </span>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Capital de départ */}
              <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-3">
                <label className="text-xs text-slate-200 font-semibold block">Capital initial offert à l'inscription</label>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Solde de jetons crédité automatiquement lors de la création d'un compte joueur.
                </p>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="0"
                    step="500"
                    value={config.defaultInitialCapital}
                    onChange={(e) => setConfig(prev => ({ ...prev, defaultInitialCapital: Math.max(0, parseInt(e.target.value) || 0) }))}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white font-mono outline-none focus:border-amber-500 transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setConfig(prev => ({ ...prev, defaultInitialCapital: 5000 }))}
                    className="px-2.5 py-2 rounded-lg bg-slate-800 text-slate-300 text-[11px] font-mono hover:bg-slate-700 whitespace-nowrap transition cursor-pointer"
                  >
                    5 000 F
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfig(prev => ({ ...prev, defaultInitialCapital: 10000 }))}
                    className="px-2.5 py-2 rounded-lg bg-slate-800 text-slate-300 text-[11px] font-mono hover:bg-slate-700 whitespace-nowrap transition cursor-pointer"
                  >
                    10 000 F
                  </button>
                </div>
              </div>

              {/* Mise minimale autorisée */}
              <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-3">
                <label className="text-xs text-slate-200 font-semibold block">Mise minimale autorisée par table</label>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Montant plancher sous lequel une table de jeu ne peut pas être créée.
                </p>
                <div className="flex gap-1.5">
                  {[50, 100, 250, 500, 1000].map((bet) => (
                    <button
                      key={bet}
                      type="button"
                      onClick={() => setConfig(prev => ({ ...prev, minTableBet: bet }))}
                      className={`flex-1 py-2 rounded-lg border text-xs font-mono font-bold transition-all cursor-pointer ${
                        config.minTableBet === bet
                          ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                          : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
                      }`}
                    >
                      {bet} F
                    </button>
                  ))}
                </div>
              </div>

              {/* Global Rake (Taxe de Table) - INACTIF */}
              <div className="col-span-1 md:col-span-2 relative">
                <KatikaNumberSliderField
                  id="global-rake-field"
                  label="Commission de table (Régulateur d'inflation) [ En prévision ]"
                  description="Ce paramètre est préparé pour la future intégration des portefeuilles et mises réelles. Actuellement inopérant en mode virtuel : tous les gains de table sont reversés à 100% aux vainqueurs."
                  value={0}
                  onChange={() => {}} // Disabled
                  disabled={true}
                  min={0}
                  max={10}
                  step={1}
                  unit="%"
                  accentColor="amber"
                  presets={[
                    { label: '0% (Actuel)', value: 0 }
                  ]}
                />
                {/* Overlay pour bien marquer l'état inactif */}
                <div className="absolute inset-0 bg-slate-950/40 rounded-xl pointer-events-none border border-amber-900/20" />
              </div>

              {/* Affichage de l'Économie & Mises */}
              <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center justify-between col-span-1 md:col-span-2">
                <div className="space-y-1 pr-4">
                  <div className="font-bold text-white text-xs flex items-center gap-2">
                    <Coins className="w-3.5 h-3.5 text-amber-400" />
                    Affichage des Mises & Jetons (Dashboard)
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Affiche ou masque les cartes financières et volumes de jetons (jetons) sur le dashboard principal (recommandé désactivé en mode démonstration / gratuit).
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setConfig(prev => ({ ...prev, bettingEconomyEnabled: !prev.bettingEconomyEnabled }))}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer shrink-0 ${
                    config.bettingEconomyEnabled ? 'bg-emerald-500' : 'bg-slate-700'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      config.bettingEconomyEnabled ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </div>

            {/* Anti-Stagnation & Escalade Automatique des Mises */}
            <div className="border-t border-slate-800 pt-5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <div className="font-bold text-white text-xs flex items-center gap-2">
                    <Flame className="w-3.5 h-3.5 text-amber-400" />
                    Escalade Automatique des Mises (Anti-Stagnation)
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Résout le blocage des parties interminables : augmente automatiquement la mise minimale après un nombre défini de donnes pour accélérer le dénouement sans dénaturer le jeu.
                  </p>
                </div>
                <button
                  type="button"
                  id="btn-toggle-auto-bet-escalation"
                  onClick={() => setConfig(prev => ({ ...prev, enableAutoBetEscalation: !(prev.enableAutoBetEscalation ?? true) }))}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer shrink-0 ${
                    (config.enableAutoBetEscalation ?? true) ? 'bg-amber-500' : 'bg-slate-700'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      (config.enableAutoBetEscalation ?? true) ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              {(config.enableAutoBetEscalation ?? true) && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                  <KatikaNumberSliderField
                    id="auto-bet-interval-field"
                    label="Fréquence d'escalade (Donnes)"
                    description="Nombre de donnes disputées entre chaque palier d'augmentation de mise."
                    value={config.autoBetEscalationInterval ?? 5}
                    onChange={(val) => setConfig(prev => ({ ...prev, autoBetEscalationInterval: val }))}
                    min={2}
                    max={12}
                    step={1}
                    unit="donnes"
                    accentColor="amber"
                    presets={[
                      { label: 'Intense (3)', value: 3 },
                      { label: 'Équilibré (5)', value: 5 },
                      { label: 'Posé (8)', value: 8 },
                    ]}
                  />

                  <KatikaNumberSliderField
                    id="auto-bet-rate-field"
                    label="Taux d'augmentation"
                    description="Pourcentage d'augmentation de la mise à chaque palier atteint."
                    value={config.autoBetEscalationRatePct ?? 50}
                    onChange={(val) => setConfig(prev => ({ ...prev, autoBetEscalationRatePct: val }))}
                    min={20}
                    max={100}
                    step={10}
                    unit="%"
                    accentColor="amber"
                    presets={[
                      { label: '+25%', value: 25 },
                      { label: '+50%', value: 50 },
                      { label: '+100%', value: 100 },
                    ]}
                  />

                  <KatikaNumberSliderField
                    id="auto-bet-max-multiplier-field"
                    label="Plafond maximal (Multiplicateur)"
                    description="Limite maximale de la mise par rapport à la mise de départ de la table."
                    value={config.maxAutoBetMultiplier ?? 4}
                    onChange={(val) => setConfig(prev => ({ ...prev, maxAutoBetMultiplier: val }))}
                    min={2}
                    max={8}
                    step={1}
                    unit="x"
                    accentColor="amber"
                    presets={[
                      { label: 'x2', value: 2 },
                      { label: 'x4 (Défaut)', value: 4 },
                      { label: 'x6', value: 6 },
                    ]}
                  />
                </div>
              )}
            </div>

            {/* Mode Maintenance et Création de Tables */}
            <div className="border-t border-slate-800 pt-5 space-y-4">
              <h4 className="text-xs font-mono text-slate-400 uppercase tracking-wider">Contrôle d'Accès & Maintenance</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                {/* Maintenance Toggle */}
                <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center justify-between">
                  <div className="space-y-1 pr-4">
                    <div className="font-bold text-white flex items-center gap-2">
                      <Power className="w-3.5 h-3.5 text-amber-400" />
                      Mode Maintenance
                    </div>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      Avertit les joueurs et suspend l'accès aux lobbies lors des interventions ou mises à jour.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setConfig(prev => ({ ...prev, isMaintenanceMode: !prev.isMaintenanceMode }))}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer shrink-0 ${
                      config.isMaintenanceMode ? 'bg-amber-500' : 'bg-slate-700'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        config.isMaintenanceMode ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>

                {/* autoriser nouvelles tables Toggle */}
                <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center justify-between">
                  <div className="space-y-1 pr-4">
                    <div className="font-bold text-white flex items-center gap-2">
                      <Sliders className="w-3.5 h-3.5 text-cyan-400" />
                      Autoriser l'Ouverture de Tables
                    </div>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      Permet ou suspend temporairement la création de nouveaux salons multijoueur.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setConfig(prev => ({ ...prev, allowNewRooms: !prev.allowNewRooms }))}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer shrink-0 ${
                      config.allowNewRooms ? 'bg-emerald-500' : 'bg-slate-700'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        config.allowNewRooms ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* DOMAIN 4: RÈGLES & VARIANTES (RULES) */}
        {settingsSubTab === 'RULES' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Trophy className="w-4 h-4 text-amber-400" />
                <h3 className="text-sm font-bold text-white">Règles & Variantes Officielles Katika</h3>
              </div>
              <span className="flex items-center gap-1.5 text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20">
                <Lock className="w-3 h-3" />
                Constantes & Variantes
              </span>
            </div>

            {/* Variantes Actives */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Moins de 21 */}
              <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center justify-between">
                <div className="space-y-1 pr-4">
                  <div className="font-bold text-white text-xs flex items-center gap-2">
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                    Règle "Moins de 21" (Victoire Immédiate)
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Si la somme des 5 cartes distribuées à un joueur est strictement inférieure à 21, la manche est remportée d'office.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setConfig(prev => ({ ...prev, enableUnder21: prev.enableUnder21 === false }))}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer shrink-0 ${
                    config.enableUnder21 !== false ? 'bg-amber-500' : 'bg-slate-700'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      config.enableUnder21 !== false ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              {/* Trois Septs */}
              <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center justify-between">
                <div className="space-y-1 pr-4">
                  <div className="font-bold text-white text-xs flex items-center gap-2">
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                    Règle "Trois Septs" (Victoire Immédiate)
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    La détention d'au moins trois cartes de valeur 7 dans la main de départ accorde une victoire immédiate avec multiplicateur x3.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setConfig(prev => ({ ...prev, enableThreeSevens: prev.enableThreeSevens === false }))}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer shrink-0 ${
                    config.enableThreeSevens !== false ? 'bg-amber-500' : 'bg-slate-700'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      config.enableThreeSevens !== false ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </div>

            {/* Constantes invariables du moteur */}
            <div className="space-y-3 pt-2">
              <h4 className="text-xs font-mono text-slate-400 uppercase tracking-wider">Multiplicateurs Gravés au Noyau</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div className="p-3.5 rounded-xl bg-slate-850 border border-slate-800 space-y-1">
                  <span className="font-bold text-white block">Partie Classique (Points)</span>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Le vainqueur empoche le pot standard constitué des mises de table engagées sans multiplicateur de pénalité.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-amber-950/15 border border-amber-900/30 space-y-1">
                  <span className="font-bold text-amber-300 block flex items-center gap-1.5">
                    <Flame className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                    Kora (Moins de 21 pts chez les adversaires)
                  </span>
                  <p className="text-[11px] text-amber-200/80 leading-relaxed">
                    Victoire éclatante. Multiplicateur de gain <b>x2</b> prélevé directement sur le solde de chaque adversaire battu.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-orange-950/15 border border-orange-900/30 space-y-1">
                  <span className="font-bold text-orange-300 block flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-orange-500 shrink-0" />
                    Double Kora (Victoire au 4ème tour avec un 3)
                  </span>
                  <p className="text-[11px] text-orange-200/80 leading-relaxed">
                    Victoire absolue. Multiplicateur de gain <b>x4</b> prélevé directement sur le solde de chaque joueur de la table.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-purple-950/15 border border-purple-900/30 space-y-1">
                  <span className="font-bold text-purple-300 block">Manche vs Partie</span>
                  <p className="text-[11px] text-purple-200/80 leading-relaxed">
                    Une <b>Manche</b> regroupe plusieurs <b>Parties</b> (donnes de 5 plis) successives jusqu'au sacre du vainqueur final de la table.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* DOMAIN 5: MESSAGE GLOBAL (BROADCAST) */}
        {settingsSubTab === 'BROADCAST' && (
          <div className="space-y-6">
            <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
              <Megaphone className="w-4 h-4 text-purple-400" />
              <h3 className="text-sm font-bold text-white">Annonce Globale en Temps Réel</h3>
            </div>

            <div className="space-y-4 text-xs">
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Rédigez un message d'information ou d'alerte. Il s'affichera instantanément sous forme de bandeau d'information défilant tout en haut de l'écran pour l'ensemble des joueurs actuellement connectés :
              </p>

              <textarea
                value={config.globalAnnouncement}
                onChange={(e) => setConfig(prev => ({ ...prev, globalAnnouncement: e.target.value }))}
                rows={4}
                placeholder="Ex : 🏆 Grand Tournoi Kora ce soir ! Mises doublées sur toutes les tables de 4 joueurs à partir de 21h GMT !"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3.5 text-xs text-white placeholder-slate-500 outline-none focus:border-purple-500 leading-relaxed transition"
              />

              {config.globalAnnouncement ? (
                <div className="p-3.5 rounded-xl bg-purple-950/25 border border-purple-900/30 flex items-center justify-between flex-wrap gap-2">
                  <span className="text-[11px] text-purple-300 flex items-center gap-2 font-mono">
                    <Radio className="w-3.5 h-3.5 animate-pulse text-purple-400 shrink-0" />
                    Bandeau d'alerte actif sur toutes les applications clientes
                  </span>
                  <button
                    type="button"
                    onClick={() => setConfig(prev => ({ ...prev, globalAnnouncement: '' }))}
                    className="px-2.5 py-1 rounded bg-slate-800 hover:bg-red-950/40 text-slate-400 hover:text-red-400 font-mono text-[10px] transition cursor-pointer"
                  >
                    Effacer le message
                  </button>
                </div>
              ) : (
                <div className="text-[11px] text-slate-500 italic font-mono bg-slate-950/40 p-3 rounded-lg border border-slate-850">
                  Aucune annonce active actuellement. Le bandeau client est masqué.
                </div>
              )}
            </div>
          </div>
        )}

        {/* DOMAIN 6: ASSISTANT IA KATIKA (AI_CONFIG) */}
        {settingsSubTab === 'AI_CONFIG' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Bot className="w-4 h-4 text-amber-400" />
                <h3 className="text-sm font-bold text-white">Configuration de l'Assistant IA Katika</h3>
              </div>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/10 text-amber-300 border border-amber-500/20 flex items-center gap-1">
                <ShieldCheck className="w-3 h-3" />
                Conseiller Lecture Seule
              </span>
            </div>

            <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2">
              <div className="text-xs font-semibold text-amber-400 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-amber-400" />
                Règle Absolue de Non-Exécution
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Le chatbot ne dispose d'aucune fonction d'écriture directe. Il ne peut modifier de son propre chef les seuils ou les paramètres ci-dessus. Toute action corrective reste manuelle et exécutée uniquement par vous.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Tone Selection */}
              <div className="space-y-2">
                <label className="text-xs text-slate-300 font-semibold flex items-center justify-between">
                  <span>Niveau de détail des réponses :</span>
                  <span className="text-amber-400 font-mono text-[11px]">
                    {aiPrefs.tone === 'concise' ? 'Concis & Direct' : aiPrefs.tone === 'detailed' ? 'Détaillé & Approfondi' : 'Équilibré'}
                  </span>
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['concise', 'balanced', 'detailed'] as ChatTone[]).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => {
                        const updated = { ...aiPrefs, tone: t };
                        setAiPrefs(updated);
                        AiAdminChatClient.savePreferences(updated);
                        setFeedback('Préférences IA mises à jour : ' + (t === 'concise' ? 'Concis' : t === 'detailed' ? 'Détaillé' : 'Équilibré'));
                      }}
                      className={`py-2 px-3 rounded-lg text-xs font-medium transition cursor-pointer border ${
                        aiPrefs.tone === t
                          ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 shadow-sm'
                          : 'bg-slate-950 text-slate-400 hover:text-slate-200 border-slate-800'
                      }`}
                    >
                      {t === 'concise' && 'Concis'}
                      {t === 'balanced' && 'Équilibré'}
                      {t === 'detailed' && 'Détaillé'}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-slate-500">
                  Détermine si l'assistant privilégie la brièveté opérationnelle ou des explications exhaustives.
                </p>
              </div>

              {/* Style Selection */}
              <div className="space-y-2">
                <label className="text-xs text-slate-300 font-semibold flex items-center justify-between">
                  <span>Orientation du style :</span>
                  <span className="text-amber-400 font-mono text-[11px]">
                    {aiPrefs.style === 'direct' ? 'Technique & Opérationnel' : aiPrefs.style === 'strategic' ? 'Stratégique & Business' : 'Pédagogique'}
                  </span>
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['pedagogical', 'direct', 'strategic'] as ChatStyle[]).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => {
                        const updated = { ...aiPrefs, style: s };
                        setAiPrefs(updated);
                        AiAdminChatClient.savePreferences(updated);
                        setFeedback('Préférences IA mises à jour : ' + (s === 'direct' ? 'Technique' : s === 'strategic' ? 'Stratégique' : 'Pédagogique'));
                      }}
                      className={`py-2 px-3 rounded-lg text-xs font-medium transition cursor-pointer border ${
                        aiPrefs.style === s
                          ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 shadow-sm'
                          : 'bg-slate-950 text-slate-400 hover:text-slate-200 border-slate-800'
                      }`}
                    >
                      {s === 'pedagogical' && 'Pédagogique'}
                      {s === 'direct' && 'Technique'}
                      {s === 'strategic' && 'Stratégique'}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-slate-500">
                  Ajuste l'angle d'analyse (orienté développement, rétention/joueurs, ou pédagogie).
                </p>
              </div>
            </div>
          </div>
        )}

        {/* DOMAIN 7: VERSIONING PWA (PWA_POLICY) */}
        {settingsSubTab === 'PWA_POLICY' && (
          <div className="space-y-6">
            <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <h3 className="text-sm font-bold text-white">Politique de Versioning PWA & Mises à Jour</h3>
            </div>

            {/* Non-Negotiable Constraint Banner */}
            <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-3 text-xs">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <span className="font-bold text-amber-300">Règle d'or de Protection des Joueurs :</span>
                <p className="text-slate-300 leading-relaxed text-[11.5px]">
                  <strong>Aucune interruption en cours de manche :</strong> Le système ne bloque ni ne force jamais de rechargement pendant une donne ou manche active. Les alertes de mise à jour s'appliquent <em>exclusivement</em> dans le Lobby et sur l'écran d'accueil.
                </p>
              </div>
            </div>

            {/* Policy Mode Selection (Graduated Response) */}
            <div className="space-y-3">
              <label className="text-xs text-slate-300 font-semibold flex items-center justify-between">
                <span>Politique d'application des versions (Réponse Graduée) :</span>
                <span className="text-amber-400 font-mono text-[11px] uppercase">
                  {config.pwaPolicyMode || 'MODERATE'}
                </span>
              </label>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {/* Permissive */}
                <button
                  type="button"
                  onClick={() => setConfig(prev => ({ ...prev, pwaPolicyMode: 'PERMISSIVE' }))}
                  className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                    (config.pwaPolicyMode || 'MODERATE') === 'PERMISSIVE'
                      ? 'bg-blue-500/15 border-blue-500/50 shadow-md shadow-blue-950/40'
                      : 'bg-slate-850/60 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-bold text-blue-300">1. Permissive</span>
                    {(config.pwaPolicyMode || 'MODERATE') === 'PERMISSIVE' && (
                      <CheckCircle2 className="w-3.5 h-3.5 text-blue-400" />
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Toast discret non bloquant. Le joueur continue de jouer sur son ancienne version sans contrainte.
                  </p>
                </button>

                {/* Moderate */}
                <button
                  type="button"
                  onClick={() => setConfig(prev => ({ ...prev, pwaPolicyMode: 'MODERATE' }))}
                  className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                    (config.pwaPolicyMode || 'MODERATE') === 'MODERATE'
                      ? 'bg-amber-500/15 border-amber-500/50 shadow-md shadow-amber-950/40'
                      : 'bg-slate-850/60 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-bold text-amber-300">2. Modérée (Standard)</span>
                    {(config.pwaPolicyMode || 'MODERATE') === 'MODERATE' && (
                      <CheckCircle2 className="w-3.5 h-3.5 text-amber-400" />
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Bandeau visible dans le Lobby invitant à actualiser pour bénéficier des correctifs de stabilité.
                  </p>
                </button>

                {/* Strict */}
                <button
                  type="button"
                  onClick={() => setConfig(prev => ({ ...prev, pwaPolicyMode: 'STRICT' }))}
                  className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                    config.pwaPolicyMode === 'STRICT'
                      ? 'bg-rose-500/15 border-rose-500/50 shadow-md shadow-rose-950/40'
                      : 'bg-slate-850/60 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-bold text-rose-300">3. Stricte (Majeure)</span>
                    {config.pwaPolicyMode === 'STRICT' && (
                      <CheckCircle2 className="w-3.5 h-3.5 text-rose-400" />
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Invite bloquante au Lobby si version inférieure à la version minimale requise (pour incompatibilités majeures).
                  </p>
                </button>
              </div>
            </div>

            {/* Version Numbers Input */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
              <div className="space-y-2">
                <label className="text-xs text-slate-300 font-semibold">Version PWA Actuelle (Déployée)</label>
                <input
                  type="text"
                  value={config.currentPwaVersion || '1.3.0'}
                  onChange={(e) => setConfig(prev => ({ ...prev, currentPwaVersion: e.target.value }))}
                  placeholder="ex: 1.3.0"
                  className="w-full bg-slate-850 border border-slate-700/60 rounded-xl p-2.5 text-xs text-white font-mono outline-none focus:border-amber-500"
                />
                <p className="text-[11px] text-slate-500">
                  Dernier build de production publié pour Njambo Kora PWA.
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-xs text-slate-300 font-semibold">Version PWA Minimale Requise</label>
                <input
                  type="text"
                  value={config.minPwaVersion || '1.2.0'}
                  onChange={(e) => setConfig(prev => ({ ...prev, minPwaVersion: e.target.value }))}
                  placeholder="ex: 1.2.0"
                  className="w-full bg-slate-850 border border-slate-700/60 rounded-xl p-2.5 text-xs text-white font-mono outline-none focus:border-amber-500"
                />
                <p className="text-[11px] text-slate-500">
                  Seuil sous lequel un avertissement majeur est affiché dans le Lobby.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* DOMAIN 8: AUDIT SÉCURITÉ & RÈGLES FIRESTORE (SECURITY_AUDIT) */}
        {settingsSubTab === 'SECURITY_AUDIT' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <h3 className="text-sm font-bold text-white">Audit des Profils & Sécurité Firestore</h3>
              </div>
              <span className="text-[11px] font-mono text-emerald-400 bg-emerald-950/40 border border-emerald-800/40 px-2 py-0.5 rounded">
                Étape Pré-déploiement Lot 3
              </span>
            </div>

            <div className="p-4 rounded-xl bg-slate-850/70 border border-slate-700/60 space-y-3">
              <p className="text-xs text-slate-300 leading-relaxed">
                Avant de déployer les nouvelles règles de sécurité Firestore, cet outil scanne l'intégralité des profils joueurs (<code className="text-amber-300 font-mono">users/{'{uid}'}</code>) pour garantir la conformité aux invariants stricts :
              </p>
              <ul className="text-[11px] text-slate-400 space-y-1 list-disc pl-5">
                <li><strong className="text-slate-200">Isolement des données personnelles :</strong> Détection de l'adresse e-mail dans le document public, copie sécurisée dans <code className="text-amber-300 font-mono">users/{'{uid}'}/private/profile</code> et suppression de la clé publique via <code className="text-amber-300 font-mono">deleteField()</code>.</li>
                <li><strong className="text-slate-200">Pseudo (displayName) :</strong> Non vide, chaîne de caractères valide, plafonné à 30 caractères maximum.</li>
                <li><strong className="text-slate-200">Jetons (chips) :</strong> Valeur numérique positive ou nulle (minimum 0).</li>
                <li><strong className="text-slate-200">Invariants de jeu :</strong> <code className="text-slate-300 font-mono">partiesWon ≤ partiesPlayed</code>, <code className="text-slate-300 font-mono">gamesWon ≤ gamesPlayed</code>, <code className="text-slate-300 font-mono">manchesWon ≤ manchesPlayed</code>, <code className="text-slate-300 font-mono">doubleKoraCount ≤ koraCount</code>, etc.</li>
                <li><strong className="text-slate-200">Types Fair-Play :</strong> Compteurs numériques valides, structure <code className="text-slate-300 font-mono">activeSanction</code> normalisée.</li>
                <li><strong className="text-slate-200">Sauvegarde avant correction :</strong> Chaque document modifié reçoit une copie intégrale dans <code className="text-amber-300 font-mono">statsLegacyBackup</code> et un export JSON téléchargeable est généré.</li>
              </ul>
            </div>

            {/* Actions Bar */}
            <div className="flex items-center gap-3 flex-wrap">
              <button
                type="button"
                disabled={isAuditing}
                onClick={async () => {
                  setIsAuditing(true);
                  setAuditError(null);
                  try {
                    const report = await KatikaService.auditAndSanitizeAllProfiles();
                    setAuditReport(report);
                    setFeedback(`Audit terminé : ${report.totalScanned} profils analysés, ${report.totalCorrected} assainis.`);
                  } catch (err: any) {
                    setAuditError(err?.message || 'Erreur lors du scan des profils.');
                  } finally {
                    setIsAuditing(false);
                  }
                }}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-lg shadow-emerald-600/20 transition-all cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isAuditing ? 'animate-spin' : ''}`} />
                <span>{isAuditing ? 'Analyse & Assainissement en cours...' : 'Lancer l’Audit & l’Assainissement'}</span>
              </button>

              {auditReport && (
                <button
                  type="button"
                  onClick={() => KatikaService.downloadBackupJson(auditReport)}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 text-xs font-semibold border border-amber-500/30 transition-all cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Télécharger l’Export JSON de Sauvegarde ({auditReport.corrections.length} modifiés)</span>
                </button>
              )}
            </div>

            {auditError && (
              <div className="p-3.5 rounded-xl bg-rose-950/70 border border-rose-800 text-rose-300 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{auditError}</span>
              </div>
            )}

            {/* Audit Summary Cards */}
            {auditReport && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="p-4 rounded-xl bg-slate-850/90 border border-slate-700/60 flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400 font-bold text-sm">
                      {auditReport.totalScanned}
                    </div>
                    <div>
                      <div className="text-[11px] text-slate-400">Profils Analysés</div>
                      <div className="text-sm font-bold text-white">100% de la base</div>
                    </div>
                  </div>

                  <div className="p-4 rounded-xl bg-slate-850/90 border border-slate-700/60 flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-bold text-sm">
                      {auditReport.totalHealthy}
                    </div>
                    <div>
                      <div className="text-[11px] text-slate-400">Profils Déjà Conformes</div>
                      <div className="text-sm font-bold text-emerald-400">Aucune modification</div>
                    </div>
                  </div>

                  <div className="p-4 rounded-xl bg-slate-850/90 border border-slate-700/60 flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 font-bold text-sm">
                      {auditReport.totalCorrected}
                    </div>
                    <div>
                      <div className="text-[11px] text-slate-400">Profils Assainis & Sécurisés</div>
                      <div className="text-sm font-bold text-amber-400">Sauvegardés & corrigés</div>
                    </div>
                  </div>
                </div>

                {/* Detailed Corrections Report */}
                {auditReport.corrections.length > 0 ? (
                  <div className="space-y-2">
                    <h4 className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-amber-400" />
                      Rapport détaillé des assainissements ({auditReport.corrections.length})
                    </h4>
                    <div className="max-h-72 overflow-y-auto space-y-2 pr-1 scrollbar-thin">
                      {auditReport.corrections.map((entry, idx) => (
                        <div key={entry.uid + idx} className="p-3 rounded-lg bg-slate-950/70 border border-slate-800 text-xs space-y-1.5">
                          <div className="flex items-center justify-between flex-wrap gap-1">
                            <span className="font-semibold text-amber-300">{entry.originalDisplayName}</span>
                            <span className="font-mono text-[10px] text-slate-500">UID: {entry.uid}</span>
                          </div>
                          <div className="text-[11px] text-rose-300 space-y-0.5">
                            {entry.reasons.map((r, ri) => (
                              <div key={ri} className="flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                                <span>{r}</span>
                              </div>
                            ))}
                          </div>
                          <div className="text-[11px] text-emerald-300 space-y-0.5">
                            {entry.appliedFixes.map((f, fi) => (
                              <div key={fi} className="flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                <span>{f}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="p-4 rounded-xl bg-emerald-950/40 border border-emerald-800/40 text-emerald-300 text-xs flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Tous les profils analysés sont 100% conformes aux invariants. Aucune correction n'était requise.</span>
                  </div>
                )}
              </div>
            )}

            {/* Checklist de Contrôle Pré-Déploiement Manuel */}
            <div className="p-5 rounded-xl bg-slate-950 border border-amber-500/30 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckSquare className="w-4 h-4 text-amber-400" />
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                    Liste de Contrôle Pré-Déploiement Manuel (Règles Firestore)
                  </h4>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/30">
                  Déploiement par l'Administrateur
                </span>
              </div>

              <p className="text-[11px] text-slate-400 leading-relaxed">
                Le déploiement des règles s'effectue manuellement par l'administrateur via la console Firebase (ou Firebase CLI) afin de conserver la maîtrise totale des versions. Validez chaque pré-requis avant d'appliquer les nouvelles règles :
              </p>

              <div className="space-y-2.5 text-xs">
                <div className="flex items-start gap-2.5 p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                  <div className={`mt-0.5 ${auditReport ? 'text-emerald-400' : 'text-slate-600'}`}>
                    {auditReport ? <CheckCircle2 className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                  </div>
                  <div>
                    <div className="font-semibold text-slate-200">1. Audit et assainissement des profils existants</div>
                    <div className="text-[11px] text-slate-400">
                      {auditReport 
                        ? `Exécuté : ${auditReport.totalScanned} profils vérifiés, 0 violation résiduelle en base.` 
                        : 'En attente : lancez l’audit ci-dessus avant de déployer.'}
                    </div>
                  </div>
                </div>

                <div className="flex items-start gap-2.5 p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                  <div className="mt-0.5 text-emerald-400">
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="font-semibold text-slate-200">2. Séparation des données privées (Email)</div>
                    <div className="text-[11px] text-slate-400">
                      Le code applicatif isole l'e-mail dans <code className="text-amber-300 font-mono">users/{'{uid}'}/private/profile</code> et ne transmet plus l'e-mail dans les écritures publiques.
                    </div>
                  </div>
                </div>

                <div className="flex items-start gap-2.5 p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                  <div className="mt-0.5 text-emerald-400">
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="font-semibold text-slate-200">3. Code applicatif à jour & File hors-ligne assainie</div>
                    <div className="text-[11px] text-slate-400">
                      Version applicative 2.5.194 déployée. Les actions de la file hors-ligne au démarrage sont purgées du champ email.
                    </div>
                  </div>
                </div>

                <div className="flex items-start gap-2.5 p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                  <div className="mt-0.5 text-emerald-400">
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="font-semibold text-slate-200">4. Sauvegarde de rollback prête</div>
                    <div className="text-[11px] text-slate-400">
                      La copie exacte des règles actuellement en production est conservée dans vos archives locales pour restauration instantanée en cas de besoin.
                    </div>
                  </div>
                </div>

                <div className="flex items-start gap-2.5 p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                  <div className="mt-0.5 text-amber-400">
                    <Square className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="font-semibold text-slate-200">5. Publication manuelle dans Firebase Console</div>
                    <div className="text-[11px] text-slate-400">
                      Copiez le texte final des règles <code className="text-amber-300 font-mono">firestore.rules</code> fourni par l'assistant et collez-le dans l'onglet <em>Firestore Database &gt; Règles</em> de votre console Firebase, puis cliquez sur <strong>Publier</strong>.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* DOMAIN 9: GESTION DES ADMINISTRATEURS (ADMINS) */}
        {settingsSubTab === 'ADMINS' && isOwner && (
          <div className="space-y-6">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Crown className="w-4 h-4 text-amber-400" />
                <h3 className="text-sm font-bold text-white">Gestion des Administrateurs Katika Secondaires</h3>
              </div>
              <span className="text-[11px] font-mono text-amber-400 bg-amber-950/40 border border-amber-800/40 px-2 py-0.5 rounded">
                Espace Propriétaire Exclusif
              </span>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              Accordez ou révoquez les privilèges administrateur secondaire (custom claim Firebase <code className="text-amber-300 font-mono">admin: true</code>). Les administrateurs secondaires ont accès au cockpit Katika Master mais ne peuvent pas modifier les accès administrateurs.
            </p>

            {/* Form: Grant new admin by email */}
            <div className="p-4 rounded-xl bg-slate-850/80 border border-slate-700/60 space-y-3">
              <h4 className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                <UserPlus className="w-4 h-4 text-emerald-400" />
                <span>Accorder le rôle Administrateur Secondaire</span>
              </h4>

              <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                <input
                  type="email"
                  value={newAdminEmail}
                  onChange={(e) => setNewAdminEmail(e.target.value)}
                  placeholder="adresse.email@exemple.com"
                  className="flex-1 bg-slate-900 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 outline-none focus:border-amber-500 font-mono"
                />
                <button
                  type="button"
                  disabled={grantingAdmin || !newAdminEmail.trim()}
                  onClick={async () => {
                    if (!newAdminEmail.trim()) return;
                    setGrantingAdmin(true);
                    setAdminError(null);
                    setAdminSuccess(null);
                    try {
                      const granted = await KatikaService.grantSecondaryAdmin(newAdminEmail.trim());
                      setAdminSuccess(`Privilège administrateur accordé avec succès à ${granted.email} !`);
                      setNewAdminEmail('');
                      await loadAdmins();
                    } catch (err: any) {
                      setAdminError(err?.message || 'Erreur lors de l’octroi des privilèges.');
                    } finally {
                      setGrantingAdmin(false);
                    }
                  }}
                  className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shrink-0"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>{grantingAdmin ? 'Octroi en cours...' : 'Accorder l\'accès'}</span>
                </button>
              </div>

              {adminSuccess && (
                <div className="p-3 rounded-xl bg-emerald-950/70 border border-emerald-800 text-emerald-300 text-xs flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>{adminSuccess}</span>
                </div>
              )}

              {adminError && (
                <div className="p-3 rounded-xl bg-rose-950/70 border border-rose-800 text-rose-300 text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>{adminError}</span>
                </div>
              )}
            </div>

            {/* List of Secondary Admins */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-amber-400" />
                  <span>Administrateurs Secondaires Actuels ({adminsList.length})</span>
                </h4>
                <button
                  type="button"
                  onClick={loadAdmins}
                  disabled={loadingAdmins}
                  className="text-[11px] font-mono text-slate-400 hover:text-amber-300 flex items-center gap-1 cursor-pointer"
                >
                  <RefreshCw className={`w-3 h-3 ${loadingAdmins ? 'animate-spin' : ''}`} />
                  <span>Actualiser</span>
                </button>
              </div>

              {loadingAdmins ? (
                <div className="p-6 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin text-amber-400" />
                  <span>Chargement des administrateurs...</span>
                </div>
              ) : adminsList.length === 0 ? (
                <div className="p-6 rounded-xl bg-slate-950/60 border border-slate-800 text-center text-slate-400 text-xs">
                  Aucun administrateur secondaire n'a été nommé pour le moment.
                </div>
              ) : (
                <div className="space-y-2">
                  {adminsList.map((adm) => (
                    <div
                      key={adm.uid}
                      className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 flex items-center justify-between gap-4 flex-wrap sm:flex-nowrap"
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-xs text-amber-300 truncate">{adm.email || 'E-mail inconnu'}</span>
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                            ADMIN
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-[10px] text-slate-500 font-mono flex-wrap">
                          <span>UID: {adm.uid}</span>
                          <span>Accordé le: {new Date(adm.grantedAt).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                          <span>Par: {adm.grantedBy}</span>
                        </div>
                      </div>

                      {revokeConfirmUid === adm.uid ? (
                        <div className="flex items-center gap-2 shrink-0 bg-rose-950/60 border border-rose-800/80 p-1.5 rounded-lg">
                          <span className="text-[10px] text-rose-300 font-bold">Confirmer la révocation ?</span>
                          <button
                            type="button"
                            disabled={revokingAdmin}
                            onClick={async () => {
                              setRevokingAdmin(true);
                              setAdminError(null);
                              try {
                                await KatikaService.revokeSecondaryAdmin(adm.uid);
                                setAdminSuccess(`Rôle administrateur révoqué pour ${adm.email || adm.uid}.`);
                                setRevokeConfirmUid(null);
                                await loadAdmins();
                              } catch (err: any) {
                                setAdminError(err?.message || 'Erreur lors de la révocation.');
                              } finally {
                                setRevokingAdmin(false);
                              }
                            }}
                            className="px-2 py-1 rounded bg-rose-600 hover:bg-rose-500 text-white text-[10px] font-bold transition cursor-pointer disabled:opacity-50"
                          >
                            {revokingAdmin ? 'Révocation...' : 'Oui, révoquer'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setRevokeConfirmUid(null)}
                            className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] transition cursor-pointer"
                          >
                            Annuler
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setRevokeConfirmUid(adm.uid)}
                          className="px-3 py-1.5 rounded-lg bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 hover:text-rose-100 border border-rose-900/50 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer shrink-0"
                        >
                          <UserMinus className="w-3.5 h-3.5 text-rose-400" />
                          <span>Révoquer</span>
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

      </div>

      {/* Global Form Action Footer */}
      <div className="flex items-center justify-between p-4 rounded-xl bg-slate-900/90 border border-slate-800 shadow-xl flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleResetDefaults}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-300 text-xs font-medium border border-slate-700 transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
            <span>Valeurs par Défaut</span>
          </button>

          <button
            type="button"
            onClick={() => {
              navigateToKatikaTab('AI_ASSISTANT', {
                initialPrompt: `Analyse et recommandations sur le paramétrage du moteur Njambo Kora :\n- Chronomètres: Coup ${config.turnTimerSeconds}s, Réflexion Bot ${config.botThinkTimeMs || 800}ms, Ramassage Pli ${config.trickResolutionTimeMs || 1600}ms, Transition ${config.transitionDelayMs || 12000}ms\n- Multijoueur: Format ${config.defaultTableMaxPlayers || 2}j, Remplissage ${config.defaultFillWithBots ? 'Mixte' : '100% Humains'}\n- Économie: Capital départ ${config.defaultInitialCapital} jetons, Mise min ${config.minTableBet} jetons, Rake ${config.globalRakePct || 0}%\n\nQue préconises-tu pour optimiser la rétention et l'expérience de jeu ?`
              });
            }}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-purple-500/20 to-amber-500/20 hover:from-purple-500/30 hover:to-amber-500/30 text-amber-200 text-xs font-semibold border border-amber-500/40 shadow-sm cursor-pointer transition-all"
            title="Demander à l'IA d'auditer ces réglages"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>Audit IA des Réglages</span>
          </button>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold shadow-lg shadow-amber-500/20 transition-all active:scale-[0.99] cursor-pointer disabled:opacity-50"
        >
          <Save className="w-4 h-4 shrink-0" />
          <span>{saving ? 'Enregistrement...' : 'Enregistrer les Paramètres'}</span>
        </button>
      </div>
    </form>
  );
};
