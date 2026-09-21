import React, { useState, useEffect, useCallback } from 'react';
import {
  Activity,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  RefreshCw,
  X,
  Server,
  KeyRound,
  User,
  Wifi,
  Hash,
  Clock,
  ShieldCheck,
} from 'lucide-react';
import { wsService } from '../../services/websocketService';
import { getPlayerId } from '../../services/identity';
import { auth } from '../../lib/firebase';
import { APP_VERSION, APP_BUILD_ID } from '../../version';
import { GoogleIcon } from './GoogleIcon';

interface HealthResponse {
  status: string;
  instanceId?: string;
  bootedAt?: number;
  activeRooms?: number;
  timestamp?: number;
}

interface ConnectionDiagnosticModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ConnectionDiagnosticModal: React.FC<ConnectionDiagnosticModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [copied, setCopied] = useState(false);
  const [healthData, setHealthData] = useState<HealthResponse | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<number>(Date.now());

  // Connection info from wsService
  const socketState = wsService.getSocketReadyState();
  const latencyMs = wsService.getLastPingLatencyMs();
  const lastError = wsService.getLastServerError();
  const activeRoomCode = wsService.getActiveRoomCode();
  const reconnectToken = wsService.getReconnectToken();

  // Auth / Identity info
  const currentUser = auth.currentUser;
  const isGoogleUser = Boolean(currentUser && !currentUser.isAnonymous);
  const localPlayerId = getPlayerId();

  // Socket state label & style
  const getSocketStateInfo = () => {
    switch (socketState) {
      case WebSocket.OPEN:
        return {
          label: 'Ouverte (Connectée)',
          color: 'text-emerald-400',
          badgeBg: 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300',
          dotBg: 'bg-emerald-400',
        };
      case WebSocket.CONNECTING:
        return {
          label: 'En cours de connexion...',
          color: 'text-amber-400',
          badgeBg: 'bg-amber-500/15 border-amber-500/40 text-amber-300',
          dotBg: 'bg-amber-400 animate-pulse',
        };
      case WebSocket.CLOSING:
        return {
          label: 'En cours de fermeture',
          color: 'text-slate-400',
          badgeBg: 'bg-slate-800 border-slate-700 text-slate-300',
          dotBg: 'bg-slate-400',
        };
      default:
        return {
          label: 'Fermée (Déconnectée)',
          color: 'text-rose-400',
          badgeBg: 'bg-rose-500/15 border-rose-500/40 text-rose-300',
          dotBg: 'bg-rose-400',
        };
    }
  };

  const socketInfo = getSocketStateInfo();

  // Safe token representation (masked: 4 chars only or none)
  const tokenDisplay = reconnectToken
    ? { present: true, preview: `${reconnectToken.substring(0, 4)}••••` }
    : { present: false, preview: 'Aucun' };

  // Fetch /api/health
  const fetchHealth = useCallback(async () => {
    setHealthLoading(true);
    setHealthError(null);
    try {
      // Trigger a ping concurrently to update latency
      wsService.triggerPing();

      const res = await fetch('/api/health', {
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data: HealthResponse = await res.json();
      setHealthData(data);
      setLastRefreshedAt(Date.now());
    } catch (err: any) {
      setHealthError(err?.message || 'Erreur réseau');
    } finally {
      setHealthLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchHealth();
    }
  }, [isOpen, fetchHealth]);

  // Build Diagnostic Report text for clipboard
  const buildDiagnosticText = () => {
    const lines = [
      '=== DIAGNOSTIC CONNEXION NJAMBO KORA ===',
      `Date du rapport : ${new Date().toISOString()}`,
      `URL du site : ${typeof window !== 'undefined' ? window.location.origin : 'N/A'}`,
      `Version App : ${APP_VERSION} (${APP_BUILD_ID})`,
      '',
      '--- ÉTAT TEMPS RÉEL ---',
      `Statut WebSocket : ${socketInfo.label}`,
      `Latence dernier ping : ${latencyMs !== null ? `${latencyMs} ms` : 'Non mesurée (aucun ping-pong récent)'}`,
      `Table active : ${activeRoomCode || 'Aucune'}`,
      '',
      '--- IDENTITÉ & SESSION ---',
      `Type identité : ${isGoogleUser ? `Compte Google (${currentUser?.displayName || currentUser?.email || 'Vérifié'})` : 'Invité (Anonyme)'}`,
      `Identifiant joueur : ${localPlayerId}`,
      `Jeton de reconnexion présent : ${tokenDisplay.present ? `Oui (préfixe: ${tokenDisplay.preview})` : 'Non'}`,
      '',
      '--- DERNIÈRE ERREUR SERVEUR ---',
      lastError
        ? `Code : ${lastError.code}\nMessage : ${lastError.message}\nHeure : ${new Date(lastError.timestamp).toLocaleTimeString()}`
        : 'Aucune erreur serveur reçue durant cette session.',
      '',
      '--- ÉTAT DU SERVEUR (/api/health) ---',
      healthData
        ? `Statut : ${healthData.status}\nInstance ID : ${healthData.instanceId || 'N/A'}\nSalons actifs : ${healthData.activeRooms ?? 'N/A'}\nServeur démarré le : ${healthData.bootedAt ? new Date(healthData.bootedAt).toLocaleString() : 'N/A'}`
        : `Statut : ${healthLoading ? 'Chargement en cours...' : healthError ? `Erreur (${healthError})` : 'Non disponible'}`,
      '========================================',
    ];
    return lines.join('\n');
  };

  const handleCopyDiagnostic = async () => {
    try {
      const text = buildDiagnosticText();
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback if clipboard API is restricted
      const textarea = document.createElement('textarea');
      textarea.value = buildDiagnosticText();
      document.body.appendChild(textarea);
      textarea.select();
      try {
        document.execCommand('copy');
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      } catch (err) {
        console.warn('[Diagnostic] Copy failed:', err);
      }
      document.body.removeChild(textarea);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      id="modal-connection-diagnostics"
      className="fixed inset-0 z-[90] bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="diagnostic-title"
    >
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-4 sm:p-5 shadow-2xl flex flex-col gap-4 max-h-[92vh] overflow-hidden text-slate-100 font-sans">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-blue-500/15 border border-blue-500/30 flex items-center justify-center text-blue-400 shrink-0">
              <Activity className="w-4.5 h-4.5" />
            </div>
            <div className="min-w-0">
              <h3 id="diagnostic-title" className="text-base font-black text-white truncate">
                Diagnostic de Connexion
              </h3>
              <p className="text-[11px] text-slate-400 truncate">
                Informations réseau et serveur en lecture seule
              </p>
            </div>
          </div>
          <button
            type="button"
            id="btn-close-diagnostic-modal"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center cursor-pointer transition"
            aria-label="Fermer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto no-scrollbar flex flex-col gap-3.5 pr-0.5">
          {/* Section 1 : Connexion Temps Réel */}
          <div className="p-3 rounded-2xl bg-slate-950/60 border border-slate-800/80 flex flex-col gap-2.5">
            <div className="flex items-center justify-between text-xs font-bold text-slate-400 uppercase tracking-wider">
              <span className="flex items-center gap-1.5 text-slate-300">
                <Wifi className="w-3.5 h-3.5 text-blue-400" />
                <span>Connexion Temps Réel</span>
              </span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border flex items-center gap-1.5 ${socketInfo.badgeBg}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${socketInfo.dotBg}`} />
                <span>{socketInfo.label}</span>
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs pt-1">
              <div className="p-2 rounded-xl bg-slate-900/80 border border-slate-800/60 flex flex-col">
                <span className="text-[10px] text-slate-400 font-medium">Latence dernier ping</span>
                <span className="text-sm font-mono font-bold text-white mt-0.5">
                  {latencyMs !== null ? (
                    <span className={latencyMs < 120 ? 'text-emerald-400' : latencyMs < 300 ? 'text-amber-400' : 'text-rose-400'}>
                      {latencyMs} ms
                    </span>
                  ) : (
                    <span className="text-slate-500 text-xs font-normal">En attente</span>
                  )}
                </span>
              </div>

              <div className="p-2 rounded-xl bg-slate-900/80 border border-slate-800/60 flex flex-col">
                <span className="text-[10px] text-slate-400 font-medium">Table active</span>
                <span className="text-sm font-mono font-bold text-amber-300 mt-0.5 truncate">
                  {activeRoomCode || <span className="text-slate-500 font-sans text-xs font-normal">Aucune</span>}
                </span>
              </div>
            </div>
          </div>

          {/* Section 2 : Identité & Reconnexion */}
          <div className="p-3 rounded-2xl bg-slate-950/60 border border-slate-800/80 flex flex-col gap-2">
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-300 uppercase tracking-wider border-b border-slate-800/60 pb-1.5">
              <User className="w-3.5 h-3.5 text-amber-400" />
              <span>Identité & Session</span>
            </div>

            <div className="flex flex-col gap-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Type de compte :</span>
                <span className="font-bold flex items-center gap-1.5">
                  {isGoogleUser ? (
                    <span className="px-2 py-0.5 rounded-full bg-blue-500/15 border border-blue-500/30 text-blue-300 text-[11px] flex items-center gap-1">
                      <GoogleIcon className="w-3 h-3" />
                      <span>Compte Google</span>
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-slate-300 text-[11px]">
                      Invité (Anonyme)
                    </span>
                  )}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-slate-400">Jeton de reconnexion :</span>
                <span className="font-mono text-xs flex items-center gap-1.5">
                  {tokenDisplay.present ? (
                    <span className="px-2 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[11px] font-bold flex items-center gap-1">
                      <ShieldCheck className="w-3 h-3 text-emerald-400" />
                      <span>Oui ({tokenDisplay.preview})</span>
                    </span>
                  ) : (
                    <span className="text-slate-500 text-[11px]">Non (aucun)</span>
                  )}
                </span>
              </div>
            </div>
          </div>

          {/* Section 3 : Dernier message d'erreur serveur */}
          <div className="p-3 rounded-2xl bg-slate-950/60 border border-slate-800/80 flex flex-col gap-2">
            <div className="flex items-center justify-between border-b border-slate-800/60 pb-1.5">
              <span className="flex items-center gap-1.5 text-xs font-bold text-slate-300 uppercase tracking-wider">
                <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
                <span>Dernière Erreur Serveur</span>
              </span>
              {lastError && (
                <span className="text-[10px] text-slate-500 font-mono">
                  {new Date(lastError.timestamp).toLocaleTimeString()}
                </span>
              )}
            </div>

            {lastError ? (
              <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs flex flex-col gap-1">
                <div className="flex items-center gap-1.5 font-mono font-bold text-rose-300 text-[11px]">
                  <span className="px-1.5 py-0.2 rounded bg-rose-500/20 text-rose-200">
                    {lastError.code}
                  </span>
                </div>
                <p className="text-rose-100 text-xs leading-relaxed font-medium">
                  {lastError.message}
                </p>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-xs text-slate-400 py-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>Aucune erreur signalée par le serveur</span>
              </div>
            )}
          </div>

          {/* Section 4 : Environnement & Serveur (/api/health) */}
          <div className="p-3 rounded-2xl bg-slate-950/60 border border-slate-800/80 flex flex-col gap-2">
            <div className="flex items-center justify-between border-b border-slate-800/60 pb-1.5">
              <span className="flex items-center gap-1.5 text-xs font-bold text-slate-300 uppercase tracking-wider">
                <Server className="w-3.5 h-3.5 text-emerald-400" />
                <span>Serveur & Version</span>
              </span>
              <button
                type="button"
                id="btn-refresh-health"
                onClick={fetchHealth}
                disabled={healthLoading}
                className="text-[11px] text-slate-400 hover:text-white flex items-center gap-1 transition cursor-pointer disabled:opacity-50"
                title="Rafraîchir les données du serveur"
              >
                <RefreshCw className={`w-3 h-3 ${healthLoading ? 'animate-spin text-amber-400' : ''}`} />
                <span>Rafraîchir</span>
              </button>
            </div>

            <div className="flex flex-col gap-1.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Version App :</span>
                <span className="font-mono text-white text-[11px] font-bold">
                  {APP_VERSION}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-slate-400">Instance ID serveur :</span>
                <span className="font-mono text-emerald-300 text-[11px]">
                  {healthLoading ? (
                    '...'
                  ) : healthData?.instanceId ? (
                    healthData.instanceId
                  ) : healthError ? (
                    <span className="text-rose-400 font-sans">Erreur ({healthError})</span>
                  ) : (
                    'N/A'
                  )}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-slate-400">Salons actifs serveur :</span>
                <span className="font-mono text-amber-300 text-[11px] font-bold">
                  {healthLoading ? '...' : healthData?.activeRooms !== undefined ? healthData.activeRooms : 'N/A'}
                </span>
              </div>

              <div className="flex items-center justify-between pt-1 border-t border-slate-800/40 text-[10px] text-slate-500">
                <span className="truncate">URL : {typeof window !== 'undefined' ? window.location.origin : ''}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="pt-2 border-t border-slate-800 flex flex-col sm:flex-row gap-2 shrink-0">
          <button
            type="button"
            id="btn-copy-diagnostic"
            onClick={handleCopyDiagnostic}
            className={`flex-1 h-10 px-3 rounded-xl font-black text-xs flex items-center justify-center gap-2 transition cursor-pointer active:scale-98 ${
              copied
                ? 'bg-emerald-500 text-slate-950 font-bold shadow-lg shadow-emerald-500/20'
                : 'bg-amber-400 hover:bg-amber-300 text-slate-950 shadow-md'
            }`}
          >
            {copied ? (
              <>
                <Check className="w-4 h-4" />
                <span>Diagnostic copié !</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                <span>Copier le diagnostic</span>
              </>
            )}
          </button>

          <button
            type="button"
            id="btn-close-diagnostic"
            onClick={onClose}
            className="h-10 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-bold text-xs transition cursor-pointer"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
};
