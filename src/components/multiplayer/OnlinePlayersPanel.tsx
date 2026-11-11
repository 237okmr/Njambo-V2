import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, RefreshCw, Swords, Wifi } from 'lucide-react';
import { OnlinePlayer, PresenceSettings, wsService } from '../../services/websocketService';
import { getPublicParamNumber } from '../../services/publicConfig';
import { FriendService } from '../../services/friendService';

interface OnlinePlayersPanelProps {
  isLoggedIn: boolean;
  isAuthLoading: boolean;
  onSignIn: () => void;
  /** Identifiants des amis confirmés, pour les repérer dans la liste. */
  friendIds: ReadonlySet<string>;
  /** Invite le joueur (à la table actuelle, ou en ouvrant une table privée). Vrai si l'invitation est partie. */
  onInvite: (player: OnlinePlayer) => Promise<boolean>;
}

const STATUS_LABEL: Record<OnlinePlayer['status'], string> = {
  AVAILABLE: 'Disponible',
  IN_SOLO: 'En solo',
  IN_LOBBY: 'Dans un salon',
  IN_GAME: 'En partie',
};

const STATUS_DOT: Record<OnlinePlayer['status'], string> = {
  AVAILABLE: 'bg-emerald-400',
  IN_SOLO: 'bg-sky-400',
  IN_LOBBY: 'bg-amber-400',
  IN_GAME: 'bg-rose-400',
};

const Switch: React.FC<{ label: string; hint: string; checked: boolean; busy: boolean; onChange: (next: boolean) => void }> = ({ label, hint, checked, busy, onChange }) => (
  <label className="flex items-start justify-between gap-3 py-2 cursor-pointer">
    <span className="flex flex-col gap-0.5 min-w-0">
      <span className="text-xs font-bold text-slate-100">{label}</span>
      <span className="text-xs text-slate-400 leading-snug">{hint}</span>
    </span>
    <input
      type="checkbox"
      role="switch"
      checked={checked}
      disabled={busy}
      onChange={(e) => onChange(e.target.checked)}
      className="mt-0.5 w-5 h-5 accent-amber-500 shrink-0 cursor-pointer disabled:opacity-50"
    />
  </label>
);

/** Sous-onglet « En ligne » : les joueurs Google visibles, avec leur statut, et le bouton pour les inviter. */
export const OnlinePlayersPanel: React.FC<OnlinePlayersPanelProps> = ({ isLoggedIn, isAuthLoading, onSignIn, friendIds, onInvite }) => {
  const [players, setPlayers] = useState<OnlinePlayer[] | null>(null);
  const [settings, setSettings] = useState<PresenceSettings | null>(null);
  const [savingSettings, setSavingSettings] = useState<boolean>(false);
  const [invitingId, setInvitingId] = useState<string | null>(null);
  const [sentIds, setSentIds] = useState<Record<string, true>>({});
  const timers = useRef<number[]>([]);

  const refresh = useCallback(() => {
    wsService.getOnlinePlayers();
  }, []);

  useEffect(() => {
    if (!isLoggedIn) return;
    const offList = wsService.onOnlinePlayers((list) => setPlayers(list));
    const offSettings = wsService.onPresenceSettings((next) => {
      setSettings(next);
      setSavingSettings(false);
    });
    wsService.getPresenceSettings();
    refresh();
    const interval = window.setInterval(() => {
      if (!document.hidden) refresh();
    }, getPublicParamNumber('clientOnlinePlayersPollSeconds') * 1000);
    return () => {
      offList();
      offSettings();
      window.clearInterval(interval);
    };
  }, [isLoggedIn, refresh]);

  useEffect(
    () => () => {
      timers.current.forEach((t) => window.clearTimeout(t));
      timers.current = [];
    },
    []
  );

  if (!isLoggedIn) {
    return (
      <div className="py-10 px-6 rounded-3xl bg-slate-900/40 border border-slate-800/80 flex flex-col items-center text-center gap-3">
        <div className="w-14 h-14 rounded-full bg-slate-800 flex items-center justify-center">
          <Wifi className="w-7 h-7 text-slate-400" />
        </div>
        <h3 className="text-sm font-bold text-slate-200">Les joueurs en ligne</h3>
        <p className="text-xs text-slate-400 max-w-[260px] leading-relaxed">Connecte-toi avec Google pour voir qui est en ligne et lancer une invitation.</p>
        <button
          type="button"
          disabled={isAuthLoading}
          onClick={onSignIn}
          className="h-10 px-4 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 text-xs font-black cursor-pointer disabled:opacity-50"
        >
          {isAuthLoading ? '...' : 'Se connecter avec Google'}
        </button>
      </div>
    );
  }

  const changeSetting = (patch: Partial<PresenceSettings>) => {
    setSavingSettings(true);
    wsService.setPresenceSettings(patch);
  };

  const invite = async (player: OnlinePlayer) => {
    setInvitingId(player.userId);
    try {
      const sent = await onInvite(player);
      if (sent) {
        setSentIds((prev) => ({ ...prev, [player.userId]: true }));
        const timer = window.setTimeout(() => {
          setSentIds((prev) => {
            const { [player.userId]: _gone, ...rest } = prev;
            return rest;
          });
        }, getPublicParamNumber('directInviteLifetimeSeconds') * 1000);
        timers.current.push(timer);
      }
    } finally {
      setInvitingId(null);
    }
  };

  const visible = (players || []).filter((p) => !FriendService.isPlayerBlocked(p.userId));

  return (
    <div className="flex flex-col gap-3">
      <div className="px-3.5 py-1 rounded-xl bg-slate-900/60 border border-slate-800 divide-y divide-slate-800/80">
        <Switch
          label="Apparaître hors ligne"
          hint="Tu n’es plus dans cette liste. Tes amis peuvent toujours t’inviter."
          checked={settings?.hidden ?? false}
          busy={!settings || savingSettings}
          onChange={(hidden) => changeSetting({ hidden })}
        />
        <Switch
          label="Invitations de mes amis seulement"
          hint="Les autres joueurs ne peuvent plus t’inviter."
          checked={settings?.friendsOnlyInvites ?? false}
          busy={!settings || savingSettings}
          onChange={(friendsOnlyInvites) => changeSetting({ friendsOnlyInvites })}
        />
      </div>

      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-black uppercase tracking-wider text-slate-400">
          {players === null ? 'Recherche…' : `${visible.length} joueur${visible.length > 1 ? 's' : ''} en ligne`}
        </span>
        <button
          type="button"
          onClick={refresh}
          aria-label="Actualiser la liste"
          className="h-8 px-2.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-300 text-xs font-bold flex items-center gap-1.5 cursor-pointer hover:border-amber-500/50"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Actualiser</span>
        </button>
      </div>

      {players === null && (
        <div className="flex items-center justify-center gap-2 p-8 text-sm text-slate-400">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>Lecture des joueurs en ligne…</span>
        </div>
      )}

      {players !== null && visible.length === 0 && (
        <div className="py-10 px-6 rounded-3xl bg-slate-900/40 border border-slate-800/80 text-center">
          <p className="text-sm font-bold text-slate-200">Personne d’autre en ligne pour le moment</p>
          <p className="text-xs text-slate-400 mt-1">Invite un ami par WhatsApp, ou reviens dans quelques minutes.</p>
        </div>
      )}

      <div className="flex flex-col gap-2">
        {visible.map((p) => {
          const invitable = p.status === 'AVAILABLE' || p.status === 'IN_SOLO';
          const sent = Boolean(sentIds[p.userId]);
          return (
            <div key={p.userId} className="p-3 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${STATUS_DOT[p.status]}`} aria-hidden="true" />
                <div className="flex flex-col min-w-0">
                  <span className="text-sm font-bold text-white truncate">
                    {p.displayName}
                    {friendIds.has(p.userId) && <span className="ml-1.5 text-xs font-bold text-amber-300">Ami</span>}
                  </span>
                  <span className="text-xs text-slate-400">{STATUS_LABEL[p.status]}</span>
                </div>
              </div>
              <button
                type="button"
                disabled={!invitable || sent || invitingId !== null}
                onClick={() => void invite(p)}
                className="h-9 px-3 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 text-xs font-black flex items-center gap-1.5 shrink-0 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {invitingId === p.userId ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Swords className="w-3.5 h-3.5" />}
                <span>{sent ? 'Invitation envoyée' : invitable ? 'Inviter' : STATUS_LABEL[p.status]}</span>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};
