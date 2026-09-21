import React, { useState, useEffect } from 'react';
import {
  X,
  Sliders,
  Globe,
  Share2,
  Cpu,
  Check,
  RotateCcw,
  ExternalLink,
  ShieldCheck,
  Sparkles,
  Cloud,
  Layers,
  Hash,
  MessageSquare,
  Sparkle,
  WifiOff,
} from 'lucide-react';
import {
  KatikaCopilotSettings,
  AVAILABLE_GEMINI_MODELS,
  AiTemperatureMode,
  LinkInclusionStrategy,
} from '../../types/copilotSettings';
import { CopilotSettingsService } from '../../services/copilotSettingsService';
import { ChatTone, ChatStyle, AiAdminChatClient } from '../../services/aiAdminChatClient';

interface KatikaCopilotSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentTone?: ChatTone;
  currentStyle?: ChatStyle;
  onUpdateToneStyle?: (tone: ChatTone, style: ChatStyle, model: string) => void;
}

export const KatikaCopilotSettingsModal: React.FC<KatikaCopilotSettingsModalProps> = ({
  isOpen,
  onClose,
  currentTone = 'balanced',
  currentStyle = 'pedagogical',
  onUpdateToneStyle,
}) => {
  const [settings, setSettings] = useState<KatikaCopilotSettings>(() =>
    CopilotSettingsService.getSettings()
  );
  const [tone, setTone] = useState<ChatTone>(currentTone);
  const [style, setStyle] = useState<ChatStyle>(currentStyle);
  const [disableStreaming, setDisableStreaming] = useState<boolean>(() =>
    AiAdminChatClient.getPreferences().disableStreaming || false
  );
  const [activeTab, setActiveTab] = useState<'prompt' | 'gemini' | 'social'>('prompt');
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [hashtagInput, setHashtagInput] = useState('');

  useEffect(() => {
    if (isOpen) {
      setSettings(CopilotSettingsService.getSettings());
      setTone(currentTone);
      setStyle(currentStyle);
      setDisableStreaming(AiAdminChatClient.getPreferences().disableStreaming || false);
      setSavedSuccess(false);
    }
  }, [isOpen, currentTone, currentStyle]);

  if (!isOpen) return null;

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await CopilotSettingsService.saveSettings(settings);
      
      const curPrefs = AiAdminChatClient.getPreferences();
      AiAdminChatClient.savePreferences({
        ...curPrefs,
        tone,
        style,
        disableStreaming,
      });

      if (onUpdateToneStyle) {
        onUpdateToneStyle(tone, style, settings.geminiModel);
      }
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 2500);
    } catch (e) {
      console.error('Erreur sauvegarde réglages:', e);
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = async () => {
    if (window.confirm('Rétablir tous les paramètres de Copilote Katika aux valeurs initiales ?')) {
      const reset = await CopilotSettingsService.resetToDefaults();
      setSettings(reset);
      setTone('balanced');
      setStyle('pedagogical');
      setDisableStreaming(false);

      const curPrefs = AiAdminChatClient.getPreferences();
      AiAdminChatClient.savePreferences({
        ...curPrefs,
        tone: 'balanced',
        style: 'pedagogical',
        disableStreaming: false,
      });

      if (onUpdateToneStyle) {
        onUpdateToneStyle('balanced', 'pedagogical', reset.geminiModel);
      }
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 2000);
    }
  };

  const handleAddHashtag = () => {
    const raw = hashtagInput.trim();
    if (!raw) return;
    const formatted = raw.startsWith('#') ? raw : `#${raw}`;
    if (!settings.customHashtags.includes(formatted)) {
      setSettings({
        ...settings,
        customHashtags: [...settings.customHashtags, formatted],
      });
    }
    setHashtagInput('');
  };

  const handleRemoveHashtag = (tagToRemove: string) => {
    setSettings({
      ...settings,
      customHashtags: settings.customHashtags.filter((t) => t !== tagToRemove),
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
      <div className="w-full max-w-2xl bg-slate-900 border border-amber-500/30 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Sliders className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-white tracking-wide">
                  Centre de Contrôle Copilote Katika
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center gap-1">
                  <Cloud className="w-2.5 h-2.5" />
                  Sync Cloud
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Paramètres unifiés : Prompt, Style IA, Modèle Gemini & Diffusion Réseaux Sociaux
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-800 bg-slate-950/40 px-5 pt-2">
          <button
            type="button"
            onClick={() => setActiveTab('prompt')}
            className={`pb-2.5 px-3 text-xs font-semibold flex items-center gap-2 border-b-2 transition cursor-pointer ${
              activeTab === 'prompt'
                ? 'border-amber-400 text-amber-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Style & Prompt IA</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('gemini')}
            className={`pb-2.5 px-3 text-xs font-semibold flex items-center gap-2 border-b-2 transition cursor-pointer ${
              activeTab === 'gemini'
                ? 'border-amber-400 text-amber-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Cpu className="w-3.5 h-3.5" />
            <span>Moteur Gemini</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('social')}
            className={`pb-2.5 px-3 text-xs font-semibold flex items-center gap-2 border-b-2 transition cursor-pointer ${
              activeTab === 'social'
                ? 'border-amber-400 text-amber-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            <span>Réseaux Sociaux & Liens</span>
          </button>
        </div>

        {/* Tab Content */}
        <div className="p-5 overflow-y-auto space-y-5 flex-1">
          {/* TAB 1: PROMPT & STYLE */}
          {activeTab === 'prompt' && (
            <div className="space-y-4">
              <div className="p-3 rounded-xl bg-amber-500/5 border border-amber-500/20 text-xs text-amber-200/90 leading-relaxed flex items-start gap-2.5">
                <Sparkles className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <span>
                  Ajustez la tonalité de rédaction et la rigueur de réponse du Copilote pour vos sessions d'analyse et de création.
                </span>
              </div>

              {/* Ton */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">
                  Niveau de concision / Détail :
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'concise' as const, label: '⚡ Direct & Concis', desc: 'Réponses synthétiques sans détours' },
                    { id: 'balanced' as const, label: '⚖️ Équilibré', desc: 'Synthèse claire et structurée' },
                    { id: 'detailed' as const, label: '📚 Détaillé & Approfondi', desc: 'Analyse complète avec contexte' },
                  ].map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setTone(t.id)}
                      className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${
                        tone === t.id
                          ? 'bg-amber-500/10 border-amber-500/50 text-amber-300 shadow-sm'
                          : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                      }`}
                    >
                      <div className="font-bold text-xs">{t.label}</div>
                      <div className="text-[9px] text-slate-500 mt-0.5">{t.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Style */}
              <div className="space-y-1.5 pt-2">
                <label className="text-xs font-semibold text-slate-300">
                  Posture & Style d'analyse :
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'pedagogical' as const, label: '🎓 Pédagogique', desc: 'Clair, didactique et accessible' },
                    { id: 'direct' as const, label: '🛠️ Opérationnel', desc: 'Focus technique et diagnostics' },
                    { id: 'strategic' as const, label: '📈 Stratégique', desc: 'Orienté croissance et rétention' },
                  ].map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setStyle(s.id)}
                      className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${
                        style === s.id
                          ? 'bg-amber-500/10 border-amber-500/50 text-amber-300 shadow-sm'
                          : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                      }`}
                    >
                      <div className="font-bold text-xs">{s.label}</div>
                      <div className="text-[9px] text-slate-500 mt-0.5">{s.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Temperature / Tone Mode */}
              <div className="space-y-1.5 pt-2">
                <label className="text-xs font-semibold text-slate-300">
                  Mode de rigueur & créativité IA :
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    {
                      id: 'analytical' as const,
                      label: '🎯 Factuel & Strict',
                      desc: 'Audit rigoureux, zéro hallucination',
                    },
                    {
                      id: 'balanced' as const,
                      label: '⚖️ Équilibré',
                      desc: 'Recommandé pour usage mixte',
                    },
                    {
                      id: 'creative' as const,
                      label: '🚀 Créatif & Marketing',
                      desc: 'Accroches percutantes, mèmes',
                    },
                  ].map((mode) => (
                    <button
                      key={mode.id}
                      type="button"
                      onClick={() =>
                        setSettings({
                          ...settings,
                          aiTemperatureMode: mode.id as AiTemperatureMode,
                        })
                      }
                      className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${
                        settings.aiTemperatureMode === mode.id
                          ? 'bg-amber-500/10 border-amber-500/50 text-amber-300 shadow-sm'
                          : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                      }`}
                    >
                      <div className="font-bold text-xs">{mode.label}</div>
                      <div className="text-[9px] text-slate-500 mt-0.5">{mode.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Flux de Réponse (Streaming vs Statique) */}
              <div className="space-y-1.5 pt-2">
                <label className="text-xs font-semibold text-slate-300">
                  Flux de réponse (Optimisation réseau) :
                </label>
                <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl flex items-center justify-between gap-3">
                  <div className="space-y-0.5">
                    <div className="text-xs font-bold text-white flex items-center gap-1.5">
                      <WifiOff className="w-3.5 h-3.5 text-amber-500" />
                      <span>Mode anti-coupure (Désactiver le streaming)</span>
                    </div>
                    <div className="text-[10px] text-slate-400">
                      Recommandé sur connexion mobile instable (4G). Les réponses s'affichent d'un seul coup mais sont 100% sécurisées contre les micro-coupures de flux.
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    id="settings-disable-streaming"
                    checked={disableStreaming}
                    onChange={(e) => setDisableStreaming(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-700 text-amber-500 bg-slate-950 focus:ring-0 focus:ring-offset-0 cursor-pointer"
                  />
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: GEMINI ENGINE */}
          {activeTab === 'gemini' && (
            <div className="space-y-5">
              {/* Server-Side Security Info */}
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    <span className="text-xs font-bold text-white">
                      Sécurité Serveur & Clé d'API Sécurisée
                    </span>
                  </div>
                  <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3" />
                    Serveur Protégé
                  </span>
                </div>

                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Toutes les requêtes d'analyse IA sont traitées directement par le serveur de manière sécurisée (via <code className="text-amber-300/90 font-mono">GEMINI_API_KEY</code> côté serveur) avec protection par limiteur de débit. Aucune clé API n'est exposée ni transmise par le navigateur.
                </p>
              </div>

              {/* Gemini Model Selection */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-300">
                  Modèle Gemini Utilisé :
                </label>
                <div className="grid grid-cols-1 gap-2">
                  {AVAILABLE_GEMINI_MODELS.map((m) => (
                    <div
                      key={m.id}
                      onClick={() => setSettings({ ...settings, geminiModel: m.id })}
                      className={`p-3 rounded-xl border transition cursor-pointer flex items-start justify-between ${
                        settings.geminiModel === m.id
                          ? 'bg-amber-500/10 border-amber-500/50 text-white shadow-sm'
                          : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                      }`}
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-xs">{m.label}</span>
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800 text-amber-400 font-semibold">
                            {m.badge}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-400">{m.description}</p>
                      </div>
                      <div className="w-4 h-4 rounded-full border flex items-center justify-center mt-1 shrink-0">
                        {settings.geminiModel === m.id && (
                          <div className="w-2 h-2 rounded-full bg-amber-400" />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: SOCIAL MEDIA & LINKS */}
          {activeTab === 'social' && (
            <div className="space-y-4">
              <div className="p-3 rounded-xl bg-amber-500/5 border border-amber-500/20 text-xs text-amber-200/90 leading-relaxed flex items-start gap-2.5">
                <Sparkles className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <span>
                  Ces liens sont automatiquement intégrés dans les légendes réseaux sociaux, messages WhatsApp et visuels graphiques générés par le Copilote.
                </span>
              </div>

              {/* App URL Input */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                  <span>Lien de l'Application Njambo Kora :</span>
                  <a
                    href={settings.socialLinks.appUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] text-amber-400 hover:underline flex items-center gap-1 font-normal"
                  >
                    <span>Tester le lien</span>
                    <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                </label>
                <div className="relative">
                  <input
                    type="url"
                    value={settings.socialLinks.appUrl}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        socialLinks: {
                          ...settings.socialLinks,
                          appUrl: e.target.value,
                        },
                      })
                    }
                    placeholder="https://njambo-kora.ai.studio"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white outline-none focus:border-amber-400 transition"
                  />
                </div>
                <p className="text-[10px] text-slate-400">
                  Lien principal d'acquisition pour inviter de nouveaux joueurs sur le web.
                </p>
              </div>

              {/* WhatsApp URL Input */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                  <span>Lien du Groupe WhatsApp Officiel :</span>
                  <a
                    href={settings.socialLinks.whatsappUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] text-emerald-400 hover:underline flex items-center gap-1 font-normal"
                  >
                    <span>Tester le groupe</span>
                    <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                </label>
                <input
                  type="url"
                  value={settings.socialLinks.whatsappUrl}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      socialLinks: {
                        ...settings.socialLinks,
                        whatsappUrl: e.target.value,
                      },
                    })
                  }
                  placeholder="https://chat.whatsapp.com/..."
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white outline-none focus:border-emerald-400 transition"
                />
                <p className="text-[10px] text-slate-400">
                  Lien de fidélisation et communauté pour les tournois et les retours joueurs.
                </p>
              </div>

              {/* Default Link Strategy */}
              <div className="space-y-2 pt-1">
                <label className="text-xs font-semibold text-slate-300">
                  Stratégie de sélection des liens par défaut :
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { id: 'AUTO', label: 'Intelligente (IA)', desc: 'Choisit selon le thème' },
                    { id: 'BOTH', label: 'Les deux', desc: 'App + WhatsApp' },
                    { id: 'APP_ONLY', label: 'Jeu seul', desc: 'Acquisition directe' },
                    { id: 'WHATSAPP_ONLY', label: 'WhatsApp seul', desc: 'Communauté' },
                  ].map((strat) => (
                    <button
                      key={strat.id}
                      type="button"
                      onClick={() =>
                        setSettings({
                          ...settings,
                          defaultLinkStrategy: strat.id as LinkInclusionStrategy,
                        })
                      }
                      className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${
                        settings.defaultLinkStrategy === strat.id
                          ? 'bg-amber-500/10 border-amber-500/50 text-amber-300 shadow-sm'
                          : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                      }`}
                    >
                      <div className="font-bold text-xs">{strat.label}</div>
                      <div className="text-[9px] text-slate-500 mt-0.5">{strat.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Additional Social Links */}
              <div className="space-y-2 pt-1">
                <span className="text-xs font-semibold text-slate-300">
                  Autres Réseaux Sociaux (Optionnels) :
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div>
                    <label className="text-[10px] text-slate-400">Facebook :</label>
                    <input
                      type="url"
                      value={settings.socialLinks.facebookUrl || ''}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          socialLinks: {
                            ...settings.socialLinks,
                            facebookUrl: e.target.value,
                          },
                        })
                      }
                      placeholder="https://facebook.com/..."
                      className="w-full mt-0.5 px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-[11px] text-white outline-none focus:border-blue-400"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400">TikTok :</label>
                    <input
                      type="url"
                      value={settings.socialLinks.tiktokUrl || ''}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          socialLinks: {
                            ...settings.socialLinks,
                            tiktokUrl: e.target.value,
                          },
                        })
                      }
                      placeholder="https://tiktok.com/@..."
                      className="w-full mt-0.5 px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-[11px] text-white outline-none focus:border-rose-400"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400">Instagram :</label>
                    <input
                      type="url"
                      value={settings.socialLinks.instagramUrl || ''}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          socialLinks: {
                            ...settings.socialLinks,
                            instagramUrl: e.target.value,
                          },
                        })
                      }
                      placeholder="https://instagram.com/..."
                      className="w-full mt-0.5 px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-[11px] text-white outline-none focus:border-purple-400"
                    />
                  </div>
                </div>
              </div>

              {/* Hashtags configuration */}
              <div className="space-y-2 pt-1">
                <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                  <span>Hashtags Officiels :</span>
                  <span className="text-[10px] text-slate-400">
                    {settings.customHashtags.length} actifs
                  </span>
                </label>
                <div className="flex flex-wrap gap-1.5 p-2 bg-slate-950 border border-slate-800 rounded-xl min-h-[44px] items-center">
                  {settings.customHashtags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs font-medium"
                    >
                      <span>{tag}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveHashtag(tag)}
                        className="text-amber-400/70 hover:text-amber-200 cursor-pointer text-xs leading-none"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                  <div className="flex items-center gap-1 ml-auto">
                    <input
                      type="text"
                      value={hashtagInput}
                      onChange={(e) => setHashtagInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddHashtag();
                        }
                      }}
                      placeholder="+ Ajouter un #tag..."
                      className="px-2 py-1 bg-transparent text-xs text-white outline-none border-b border-slate-700 focus:border-amber-400 w-32"
                    />
                    <button
                      type="button"
                      onClick={handleAddHashtag}
                      className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-xs font-bold transition cursor-pointer"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-800 bg-slate-950 flex items-center justify-between">
          <button
            type="button"
            onClick={handleReset}
            className="text-xs text-slate-400 hover:text-rose-400 flex items-center gap-1.5 transition cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Rétablir par défaut</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition cursor-pointer"
            >
              Fermer
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className={`px-4 py-1.5 rounded-xl text-xs font-bold flex items-center gap-2 transition cursor-pointer shadow-lg ${
                savedSuccess
                  ? 'bg-emerald-500 text-white'
                  : 'bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950'
              }`}
            >
              {savedSuccess ? (
                <>
                  <Check className="w-4 h-4" />
                  <span>Enregistré dans le Cloud !</span>
                </>
              ) : (
                <>
                  <Cloud className="w-4 h-4" />
                  <span>{isSaving ? 'Enregistrement...' : 'Enregistrer'}</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
