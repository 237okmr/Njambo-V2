import React, { useCallback, useEffect, useState } from 'react';
import { Bell, Check, LifeBuoy, Lock, LogOut, RefreshCw, ShieldCheck, UserX, Volume2, VolumeX } from 'lucide-react';
import { FriendService, BlockedPlayerRecord } from '../../services/friendService';
import { triggerHaptic } from '../../utils/sound';
import { GoogleIcon } from '../common/GoogleIcon';
import { ReportProblemCard } from '../common/ReportProblemCard';
import { MobileMoneySection } from './MobileMoneySection';
import { PlayerAvatar } from './PlayerAvatar';
import { PushNotificationToggle } from './PushNotificationToggle';

interface ProfileSettingsTabProps {
  uid: string;
  displayName: string;
  email?: string | null;
  photoURL?: string | null;
  gamesPlayed: number;
  gamesWon: number;
  isLoggedIn: boolean;
  isSyncing: boolean;
  onLogin: () => void;
  onLogout: () => void;
  soundEnabled?: boolean;
  onToggleSound?: () => void;
  onOpenDiagnostic: () => void;
  onOpenKoraCash?: () => void;
}

const SectionTitle: React.FC<{ icon: React.ComponentType<{ className?: string }>; children: React.ReactNode }> = ({ icon: Icon, children }) => (
  <h3 className="px-1 text-xs font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
    <Icon className="w-3.5 h-3.5 text-amber-400" />
    {children}
  </h3>
);

/** Tout ce qui se règle pour le compte, quel que soit le mode de jeu. */
export const ProfileSettingsTab: React.FC<ProfileSettingsTabProps> = ({
  uid,
  displayName,
  email,
  photoURL,
  gamesPlayed,
  gamesWon,
  isLoggedIn,
  isSyncing,
  onLogin,
  onLogout,
  soundEnabled,
  onToggleSound,
  onOpenDiagnostic,
  onOpenKoraCash,
}) => {
  const [blockedPlayers, setBlockedPlayers] = useState<BlockedPlayerRecord[]>([]);
  const [isLoadingBlocked, setIsLoadingBlocked] = useState<boolean>(false);

  const loadBlockedPlayers = useCallback(async () => {
    setIsLoadingBlocked(true);
    try {
      setBlockedPlayers(await FriendService.fetchCloudBlockedPlayers(uid));
    } catch (e) {
      console.error('Error loading blocked players:', e);
    } finally {
      setIsLoadingBlocked(false);
    }
  }, [uid]);

  useEffect(() => {
    void loadBlockedPlayers();
  }, [loadBlockedPlayers]);

  const handleUnblockPlayer = async (targetUid: string) => {
    try {
      await FriendService.unblockPlayer(targetUid);
      setBlockedPlayers((prev) => prev.filter((p) => p.uid !== targetUid));
      triggerHaptic('light');
    } catch (e) {
      console.error('Error unblocking player:', e);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-150">
      {/* Compte */}
      <section id="settings-account" className="flex flex-col gap-2">
        <SectionTitle icon={ShieldCheck}>Compte</SectionTitle>
        {isLoggedIn ? (
          <div className="p-4 rounded-2xl bg-slate-900/60 border border-emerald-500/30 flex flex-col gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="relative shrink-0">
                {photoURL ? (
                  <img src={photoURL} alt="Photo Google" className="w-12 h-12 rounded-full border-2 border-emerald-400 object-cover" referrerPolicy="no-referrer" />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-emerald-500/20 border-2 border-emerald-400 flex items-center justify-center">
                    <GoogleIcon className="w-5 h-5" />
                  </div>
                )}
                <span className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-slate-950 border-2 border-emerald-400 flex items-center justify-center">
                  <Check className="w-3 h-3 text-emerald-400 stroke-[3]" />
                </span>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-black text-white truncate">{displayName}</p>
                {email && <p className="text-xs font-semibold text-emerald-300 truncate">{email}</p>}
                <p className="text-xs text-slate-400">Ta progression est sauvegardée sur ce compte.</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onLogout}
              disabled={isSyncing}
              className="w-full min-h-11 px-4 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 text-sm font-bold flex items-center justify-center gap-1.5 transition cursor-pointer active:scale-[0.98] disabled:opacity-50"
            >
              <LogOut className="w-4 h-4" />
              <span>Se déconnecter</span>
            </button>
            <p className="text-xs text-slate-500 text-center">Tu repasseras en mode invité sur cet appareil.</p>
          </div>
        ) : (
          <div className="p-4 rounded-2xl bg-gradient-to-br from-slate-900 via-amber-950/20 to-slate-950 border border-amber-500/30 flex flex-col gap-3">
            <div className="space-y-1">
              <p className="text-base font-black text-white">Protège ta progression</p>
              <p className="text-sm text-slate-300 leading-relaxed">
                Tu joues en mode invité. Connecte-toi pour garder tes victoires et ton rang, même sur un autre téléphone.
              </p>
            </div>
            <button
              type="button"
              id="btn-google-login-dedicated"
              onClick={onLogin}
              disabled={isSyncing}
              className="w-full min-h-12 px-4 rounded-xl bg-white hover:bg-slate-100 text-slate-900 font-extrabold text-sm flex items-center justify-center gap-2.5 transition active:scale-[0.98] cursor-pointer disabled:opacity-50"
            >
              {isSyncing ? <RefreshCw className="w-4 h-4 animate-spin text-slate-700" /> : <GoogleIcon className="w-4 h-4" />}
              <span>{isSyncing ? 'Connexion en cours...' : 'Sauvegarder avec Google'}</span>
            </button>
            <p className="text-xs text-slate-400 flex items-start gap-1.5">
              <Lock className="w-3 h-3 text-slate-500 shrink-0 mt-0.5" />
              <span>
                Connexion sans mot de passe. Tes {gamesPlayed} partie(s) et {gamesWon} victoire(s) seront rattachées à ton compte.
              </span>
            </p>
          </div>
        )}
      </section>

      <MobileMoneySection isLoggedIn={isLoggedIn} onOpenKoraCash={onOpenKoraCash} />

      {/* Notifications et son */}
      <section id="settings-notifications" className="flex flex-col gap-2">
        <SectionTitle icon={Bell}>Notifications et son</SectionTitle>
        <PushNotificationToggle userId={uid || 'guest'} userName={displayName || 'Joueur'} />
        {onToggleSound && (
          <button
            type="button"
            id="btn-settings-sound"
            role="switch"
            aria-checked={Boolean(soundEnabled)}
            onClick={onToggleSound}
            className="w-full min-h-12 px-4 rounded-2xl bg-slate-900/60 border border-slate-800 hover:border-slate-700 flex items-center justify-between gap-3 transition cursor-pointer"
          >
            <span className="flex items-center gap-2.5 text-sm font-bold text-slate-200">
              {soundEnabled ? <Volume2 className="w-4 h-4 text-amber-400" /> : <VolumeX className="w-4 h-4 text-slate-500" />}
              Sons du jeu
            </span>
            <span className={`text-xs font-black px-2.5 py-1 rounded-full ${soundEnabled ? 'bg-amber-500/20 text-amber-300' : 'bg-slate-800 text-slate-400'}`}>
              {soundEnabled ? 'Activés' : 'Coupés'}
            </span>
          </button>
        )}
      </section>

      {/* Joueurs bloqués */}
      <section id="settings-blocked" className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <SectionTitle icon={UserX}>Joueurs bloqués ({blockedPlayers.length})</SectionTitle>
          <button
            type="button"
            onClick={() => void loadBlockedPlayers()}
            disabled={isLoadingBlocked}
            aria-label="Actualiser la liste"
            title="Actualiser la liste"
            className="w-9 h-9 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 flex items-center justify-center transition cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isLoadingBlocked ? 'animate-spin' : ''}`} />
          </button>
        </div>
        <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 flex flex-col gap-2">
          <p className="text-xs text-slate-400">Ils ne peuvent ni t’envoyer d’invitations ni te trouver lors des recherches.</p>
          {blockedPlayers.length === 0 ? (
            <p className="py-2 text-sm font-semibold text-slate-400 text-center">Aucun joueur bloqué.</p>
          ) : (
            blockedPlayers.map((player) => (
              <div key={player.uid} className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <PlayerAvatar avatarId="lion" size="sm" className="w-9 h-9 border border-rose-500/30" />
                  <div className="flex flex-col min-w-0">
                    <span className="text-sm font-bold text-white truncate">{player.displayName}</span>
                    <span className="text-xs text-amber-400 font-mono font-bold">{player.friendCode}</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void handleUnblockPlayer(player.uid)}
                  className="min-h-11 px-3 rounded-xl bg-slate-800 hover:bg-emerald-500/20 hover:text-emerald-400 text-slate-300 text-xs font-bold border border-slate-700 hover:border-emerald-500/40 transition active:scale-95 cursor-pointer shrink-0"
                >
                  Débloquer
                </button>
              </div>
            ))
          )}
        </div>
      </section>

      {/* Aide */}
      <section id="settings-help" className="flex flex-col gap-2">
        <SectionTitle icon={LifeBuoy}>Aide</SectionTitle>
        <ReportProblemCard onOpenDiagnostic={onOpenDiagnostic} />
      </section>
    </div>
  );
};
