import React, { useState, useEffect, useCallback } from 'react';
import { 
  Key, 
  ShieldCheck, 
  CheckCircle2, 
  AlertTriangle, 
  Loader2, 
  RefreshCw, 
  Lock, 
  Eye, 
  EyeOff, 
  Server, 
  Sparkles,
  Radio
} from 'lucide-react';
import { tikaFetch } from '../services/tikaFetch';
import { KatikaService } from '../services/katikaService';
import { useKatikaAuth } from '../context/KatikaAuthContext';

export type CashProvider = 'campay' | 'notchpay';
export type CashEnvironment = 'demo' | 'live';

interface FieldConfig {
  key: string;
  label: string;
  placeholder: string;
  helper?: string;
}

const CAMPAY_FIELDS: FieldConfig[] = [
  { key: 'app_id', label: "ID de l'application", placeholder: "Identifiant d'application Campay" },
  { key: 'username', label: "Nom d'utilisateur", placeholder: "Nom d'utilisateur d'API Campay" },
  { key: 'password', label: "Mot de passe", placeholder: "Mot de passe d'API Campay" },
  { key: 'permanent_token', label: "Jeton d'accès permanent", placeholder: "Token permanent de collecte", helper: "Jeton statique fourni dans la console Campay" },
  { key: 'webhook_key', label: "Clé webhook", placeholder: "Clé secrète de signature de notification webhook" },
];

const NOTCHPAY_FIELDS: FieldConfig[] = [
  { key: 'public_key', label: "Clé publique", placeholder: "sb.pub.xxxxxxxx ou pub.xxxxxxxx" },
  { key: 'private_key', label: "Clé privée / Token", placeholder: "sb.sec.xxxxxxxx ou sec.xxxxxxxx" },
  { key: 'webhook_key', label: "Clé webhook / Hash", placeholder: "Signature de notification webhook Notch Pay" },
];

export const ProviderKeysPanel: React.FC = () => {
  const { user } = useKatikaAuth();
  const [provider, setProvider] = useState<CashProvider>('campay');
  const [environment, setEnvironment] = useState<CashEnvironment>('demo');
  const [activeProviderId, setActiveProviderId] = useState<string | null>(null);
  const [settingActive, setSettingActive] = useState<boolean>(false);

  // Valeurs saisies temporairement par l'utilisateur (vidées immédiatement après sauvegarde)
  const [inputs, setInputs] = useState<Record<string, string>>({});
  
  // Identifiants masqués chargés depuis le serveur (ex: ••••ab12)
  const [maskedFields, setMaskedFields] = useState<Record<string, string>>({});
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [updatedBy, setUpdatedBy] = useState<string | null>(null);

  const [loading, setLoading] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [testing, setTesting] = useState<boolean>(false);
  
  const [showPlainInputs, setShowPlainInputs] = useState<Record<string, boolean>>({});
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const currentFieldList = provider === 'campay' ? CAMPAY_FIELDS : NOTCHPAY_FIELDS;

  // Chargement des données masquées depuis le serveur
  const loadMaskedCredentials = useCallback(async () => {
    setLoading(true);
    setFeedback(null);
    setTestResult(null);
    try {
      const res = await tikaFetch(`/api/katika/cash/providers/${provider}/${environment}`);
      if (!res.ok) {
        throw new Error(`Erreur HTTP ${res.status}`);
      }
      const data = await res.json();
      if (data.success && data.credentials) {
        setMaskedFields(data.credentials.fields || {});
        setUpdatedAt(data.credentials.updatedAt || null);
        setUpdatedBy(data.credentials.updatedBy || null);
      } else {
        setMaskedFields({});
        setUpdatedAt(null);
        setUpdatedBy(null);
      }
    } catch (err: any) {
      console.warn('[ProviderKeysPanel] Échec chargement identifiants masqués:', err);
      setMaskedFields({});
      setUpdatedAt(null);
      setUpdatedBy(null);
    } finally {
      setLoading(false);
    }
  }, [provider, environment]);

  useEffect(() => {
    // Vider toute saisie locale lors d'un basculement de prestataire ou d'environnement
    setInputs({});
    setShowPlainInputs({});
    loadMaskedCredentials();
  }, [provider, environment, loadMaskedCredentials]);

  // Charge le prestataire actif (config Kora Cash, onglet Général) une seule fois au montage
  useEffect(() => {
    KatikaService.getKoraCashConfig().then((cfg) => {
      setActiveProviderId(cfg.activeProviderId);
    });
  }, []);

  const handleSetActiveProvider = async () => {
    setSettingActive(true);
    try {
      const updated = await KatikaService.updateKoraCashConfig(
        { activeProviderId: provider },
        user?.email || undefined
      );
      setActiveProviderId(updated.activeProviderId);
    } finally {
      setSettingActive(false);
    }
  };

  const handleInputChange = (fieldKey: string, val: string) => {
    setInputs(prev => ({ ...prev, [fieldKey]: val }));
  };

  const toggleShowField = (fieldKey: string) => {
    setShowPlainInputs(prev => ({ ...prev, [fieldKey]: !prev[fieldKey] }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    setTestResult(null);

    // Filtrer les valeurs non vides et non masquées
    const payload: Record<string, string> = {};
    for (const [k, v] of Object.entries(inputs)) {
      if (typeof v === 'string' && v.trim() !== '' && !v.startsWith('••••')) {
        payload[k] = v.trim();
      }
    }

    if (Object.keys(payload).length === 0) {
      setFeedback({
        type: 'info',
        message: 'Aucun nouveau secret saisi à enregistrer.',
      });
      return;
    }

    setSaving(true);
    try {
      const res = await tikaFetch(`/api/katika/cash/providers/${provider}/${environment}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ fields: payload }),
      });

      const data = await res.json();
      if (data.success) {
        // Règle stricte : vider immédiatement les valeurs en mémoire
        setInputs({});
        setShowPlainInputs({});
        setFeedback({
          type: 'success',
          message: 'Identifiants enregistrés et chiffrés (AES-256-GCM) avec succès.',
        });
        // Recharger les données masquées depuis le serveur
        await loadMaskedCredentials();
      } else {
        setFeedback({
          type: 'error',
          message: data.error || "Échec de l'enregistrement des identifiants.",
        });
      }
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err?.message || 'Erreur réseau lors de la sauvegarde.',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    if (provider !== 'campay') {
      setTestResult({
        success: false,
        message: 'Le test de connexion pour Notch Pay sera disponible dans un lot ultérieur.',
      });
      return;
    }

    setTesting(true);
    setTestResult(null);
    try {
      const res = await tikaFetch(`/api/katika/cash/providers/${provider}/${environment}/test`, {
        method: 'POST',
      });
      const data = await res.json();
      setTestResult({
        success: Boolean(data.success),
        message: data.message || (data.success ? 'Connexion réussie.' : 'Échec du test de connexion.'),
      });
    } catch (err: any) {
      setTestResult({
        success: false,
        message: `Erreur lors de l'appel de test : ${err?.message || 'Erreur inconnue'}`,
      });
    } finally {
      setTesting(false);
    }
  };

  const hasConfiguredKeys = Object.keys(maskedFields).length > 0;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 md:p-6 shadow-xl text-slate-100 space-y-6">
      {/* En-tête */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-400">
              <Key className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                Identifiants Kora Cash & Prestataires
                <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
                  AES-256-GCM
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Stockage sécurisé Firestore admin. Les secrets ne sont jamais exposés en clair ni journalisés.
              </p>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={loadMaskedCredentials}
          disabled={loading}
          className="self-start md:self-auto flex items-center gap-1.5 px-3 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700 transition"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Actualiser
        </button>
      </div>

      {/* Sélecteurs Prestataire et Environnement */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-950/50 p-4 rounded-xl border border-slate-800/80">
        <div>
          <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
            Prestataire de Paiement
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setProvider('campay')}
              className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-semibold border transition ${
                provider === 'campay'
                  ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md shadow-amber-500/10'
                  : 'bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-700'
              }`}
            >
              <Radio className="w-3.5 h-3.5" />
              Campay (Mobile Money)
            </button>
            <button
              type="button"
              onClick={() => setProvider('notchpay')}
              className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-semibold border transition ${
                provider === 'notchpay'
                  ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md shadow-amber-500/10'
                  : 'bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-700'
              }`}
            >
              <Radio className="w-3.5 h-3.5" />
              Notch Pay
            </button>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
            Environnement
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setEnvironment('demo')}
              className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-semibold border transition ${
                environment === 'demo'
                  ? 'bg-blue-600 text-white border-blue-500 shadow-md shadow-blue-600/10'
                  : 'bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-700'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              Bac à sable (Démo)
            </button>
            <button
              type="button"
              onClick={() => setEnvironment('live')}
              className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-semibold border transition ${
                environment === 'live'
                  ? 'bg-rose-600 text-white border-rose-500 shadow-md shadow-rose-600/10'
                  : 'bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-700'
              }`}
            >
              <Server className="w-3.5 h-3.5" />
              Production (LIVE)
            </button>
          </div>
        </div>
      </div>

      {/* État des identifiants existants */}
      <div className="flex flex-wrap items-center justify-between text-xs text-slate-400 bg-slate-950/30 px-3.5 py-2.5 rounded-lg border border-slate-800/60">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span>
            Configuration actuelle :{' '}
            <strong className="text-slate-200">
              {provider.toUpperCase()} ({environment.toUpperCase()})
            </strong>
          </span>
          <span className="text-slate-600">•</span>
          <span>
            {hasConfiguredKeys ? (
              <span className="text-emerald-400 font-medium">Identifiants enregistrés</span>
            ) : (
              <span className="text-slate-500">Aucun identifiant enregistré pour cet environnement</span>
            )}
          </span>
          <span className="text-slate-600">•</span>
          <span>
            {activeProviderId === provider ? (
              <span className="text-amber-400 font-semibold">Prestataire actif</span>
            ) : (
              <span className="text-slate-500">
                Prestataire actif : {activeProviderId ? activeProviderId.toUpperCase() : 'aucun'}
              </span>
            )}
          </span>
        </div>
        {updatedAt && (
          <div className="text-slate-500 mt-1 sm:mt-0">
            Dernière mise à jour : {new Date(updatedAt).toLocaleString('fr-FR')} {updatedBy ? `(par ${updatedBy.slice(0, 8)}...)` : ''}
          </div>
        )}
      </div>

      {/* Formulaire de saisie des clés */}
      <form onSubmit={handleSave} className="space-y-4">
        <div className="space-y-3.5">
          {currentFieldList.map(field => {
            const hasExisting = Boolean(maskedFields[field.key]);
            const isPlain = Boolean(showPlainInputs[field.key]);
            const currentVal = inputs[field.key] || '';

            return (
              <div key={field.key} className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
                    <Lock className="w-3 h-3 text-slate-400" />
                    {field.label}
                  </label>
                  {hasExisting && (
                    <span className="text-[11px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                      Enregistré : {maskedFields[field.key]}
                    </span>
                  )}
                </div>

                <div className="relative">
                  <input
                    type={isPlain ? 'text' : 'password'}
                    value={currentVal}
                    onChange={e => handleInputChange(field.key, e.target.value)}
                    placeholder={hasExisting ? `•••• (laisser vide pour conserver)` : field.placeholder}
                    autoComplete="off"
                    spellCheck={false}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 pr-10 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/30 transition font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => toggleShowField(field.key)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition p-1"
                    title={isPlain ? 'Masquer' : 'Afficher en clair pendant la frappe'}
                  >
                    {isPlain ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>

                {field.helper && (
                  <p className="text-[11px] text-slate-500">{field.helper}</p>
                )}
              </div>
            );
          })}
        </div>

        {/* Message de notification / feedback */}
        {feedback && (
          <div
            className={`flex items-start gap-2 p-3 rounded-lg text-xs border ${
              feedback.type === 'success'
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                : feedback.type === 'error'
                ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                : 'bg-blue-500/10 border-blue-500/30 text-blue-300'
            }`}
          >
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            )}
            <span>{feedback.message}</span>
          </div>
        )}

        {/* Résultat du test de connexion */}
        {testResult && (
          <div
            className={`flex items-start gap-2 p-3 rounded-lg text-xs border ${
              testResult.success
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
            }`}
          >
            {testResult.success ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            )}
            <div>
              <p className="font-semibold">Résultat du test :</p>
              <p>{testResult.message}</p>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-3 pt-3 border-t border-slate-800">
          <button
            type="button"
            onClick={handleSetActiveProvider}
            disabled={settingActive || !hasConfiguredKeys || activeProviderId === provider}
            className="flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg border border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {settingActive ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Activation...
              </>
            ) : activeProviderId === provider ? (
              <>
                <ShieldCheck className="w-3.5 h-3.5" />
                Prestataire actif
              </>
            ) : (
              <>
                <Radio className="w-3.5 h-3.5" />
                Définir comme prestataire actif
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleTestConnection}
            disabled={testing || saving || (provider === 'campay' && !hasConfiguredKeys && Object.keys(inputs).length === 0)}
            className="flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {testing ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Test en cours...
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                Tester la connexion
              </>
            )}
          </button>

          <button
            type="submit"
            disabled={saving || testing}
            className="flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 transition shadow-md shadow-amber-500/10 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Enregistrement chiffré...
              </>
            ) : (
              <>
                <ShieldCheck className="w-3.5 h-3.5" />
                Enregistrer les identifiants
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};
