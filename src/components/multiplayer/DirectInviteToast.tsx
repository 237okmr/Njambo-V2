import React, { useEffect, useState } from 'react';
import { Check, Clock, Swords, UserX, X } from 'lucide-react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { GameInvitation } from '../../types';
import { PlayerAvatar } from '../profile/PlayerAvatar';
import { triggerHaptic } from '../../utils/sound';
import { wsService } from '../../services/websocketService';

interface DirectInviteToastProps {
  invitations: GameInvitation[];
  onAccept: (invitation: GameInvitation) => void;
  onDecline: (invitation: GameInvitation) => void;
  onDismiss: (inviteId: string) => void;
  onBlock?: (invitation: GameInvitation) => void;
  /** Pendant une donne : bandeau d'une ligne qui ne masque ni le chrono ni les adversaires. */
  compact?: boolean;
  /** Vrai si accepter met la partie solo en cours en sauvegarde automatique. */
  willSaveSolo?: boolean;
}

/** Une invitation vit 120 s, comme côté serveur (expiresAt) : plus de décalage 20 s / 120 s / 1 h. */
const INVITE_LIFETIME_MS = 120_000;

function getExpiresAt(invitation: GameInvitation): number {
  const anyInvite = invitation as GameInvitation & { expiresAt?: number };
  if (typeof anyInvite.expiresAt === 'number') return anyInvite.expiresAt;
  return (invitation.createdAt || Date.now()) + INVITE_LIFETIME_MS;
}

function formatRemaining(seconds: number): string {
  if (seconds >= 60) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }
  return `${seconds}s`;
}

/**
 * Composant sans hook : il décide seulement quoi afficher. Les hooks vivent dans InviteCard,
 * ce qui respecte les règles de React (aucun hook après un return anticipé).
 */
export const DirectInviteToast: React.FC<DirectInviteToastProps> = ({
  invitations,
  onAccept,
  onDecline,
  onDismiss,
  onBlock,
  compact = false,
  willSaveSolo = false,
}) => {
  if (!invitations || invitations.length === 0) return null;
  const current = invitations[0];
  return (
    <AnimatePresence mode="wait">
      <InviteCard
        key={current.id}
        invitation={current}
        othersCount={invitations.length - 1}
        onAccept={onAccept}
        onDecline={onDecline}
        onDismiss={onDismiss}
        onBlock={onBlock}
        compact={compact}
        willSaveSolo={willSaveSolo}
      />
    </AnimatePresence>
  );
};

interface InviteCardProps {
  invitation: GameInvitation;
  othersCount: number;
  onAccept: (invitation: GameInvitation) => void;
  onDecline: (invitation: GameInvitation) => void;
  onDismiss: (inviteId: string) => void;
  onBlock?: (invitation: GameInvitation) => void;
  compact: boolean;
  willSaveSolo: boolean;
}

const InviteCard: React.FC<InviteCardProps> = ({
  invitation,
  othersCount,
  onAccept,
  onDecline,
  onDismiss,
  onBlock,
  compact,
  willSaveSolo,
}) => {
  const reduceMotion = useReducedMotion();
  const expiresAt = getExpiresAt(invitation);
  const [secondsLeft, setSecondsLeft] = useState<number>(() =>
    Math.max(0, Math.ceil((expiresAt - wsService.getServerTime()) / 1000))
  );

  useEffect(() => {
    const tick = () => {
      const left = Math.max(0, Math.ceil((expiresAt - wsService.getServerTime()) / 1000));
      setSecondsLeft(left);
      if (left <= 0) onDismiss(invitation.id);
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [expiresAt, invitation.id, onDismiss]);

  const urgent = secondsLeft <= 15;
  const progress = Math.max(0, Math.min(100, (secondsLeft * 1000 * 100) / INVITE_LIFETIME_MS));

  const accept = () => {
    triggerHaptic('success');
    onAccept(invitation);
  };
  const decline = () => {
    triggerHaptic('light');
    onDecline(invitation);
  };
  const block = () => {
    triggerHaptic('heavy');
    if (onBlock) onBlock(invitation);
  };

  const timerPill = (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-black ${
        urgent
          ? 'animate-pulse border-rose-500/40 bg-rose-500/20 text-rose-300'
          : 'border-slate-700 bg-slate-800 text-amber-300'
      }`}
    >
      <Clock className="h-2.5 w-2.5" aria-hidden="true" />
      {formatRemaining(secondsLeft)}
    </span>
  );

  const motionProps = {
    initial: reduceMotion ? { opacity: 0 } : { opacity: 0, y: -16, scale: 0.97 },
    animate: reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 },
    exit: reduceMotion ? { opacity: 0 } : { opacity: 0, y: -16, scale: 0.97 },
    transition: { type: 'spring' as const, damping: 24, stiffness: 320 },
  };

  const avatar = (
    <div className="relative shrink-0">
      <PlayerAvatar avatarId={(invitation.fromUserAvatar as any) || 'avatar_1'} size="sm" className="h-9 w-9" />
      <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-amber-400 text-slate-950 shadow">
        <Swords className="h-2.5 w-2.5" aria-hidden="true" />
      </span>
    </div>
  );

  // ---- Bandeau d'une ligne (pendant une donne) ----
  if (compact) {
    return (
      <motion.div
        {...motionProps}
        role="alert"
        className="pointer-events-auto relative w-full max-w-sm overflow-hidden rounded-2xl border border-amber-500/50 bg-slate-900/95 p-2 shadow-xl backdrop-blur-xl"
      >
        <div className="absolute inset-x-0 top-0 h-0.5 bg-slate-800">
          <div
            className={`h-full transition-all duration-1000 ease-linear ${urgent ? 'bg-rose-500' : 'bg-amber-400'}`}
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="flex items-center gap-2">
          {avatar}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-xs font-black text-white">{invitation.fromUserName} te lance un défi</span>
              {timerPill}
            </div>
            <span className="block truncate text-[11px] text-slate-400">
              Table #{invitation.roomCode} · {invitation.baseBet} jetons
              {othersCount > 0 ? ` · +${othersCount} autre${othersCount > 1 ? 's' : ''}` : ''}
            </span>
          </div>
          {onBlock && (
            <button
              type="button"
              aria-label="Bloquer ce joueur"
              title="Bloquer ce joueur"
              onClick={block}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 transition active:scale-95"
            >
              <UserX className="h-4 w-4" />
            </button>
          )}
          <button
            type="button"
            aria-label="Refuser l'invitation"
            onClick={decline}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-800 text-slate-300 transition hover:bg-slate-700 hover:text-white active:scale-95"
          >
            <X className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={accept}
            className="flex h-11 shrink-0 items-center justify-center gap-1 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 px-3 text-xs font-black text-slate-950 shadow-md shadow-emerald-500/20 transition active:scale-95"
          >
            <Check className="h-3.5 w-3.5" />
            Rejoindre
          </button>
        </div>
        {willSaveSolo && (
          <p className="mt-1 truncate pl-11 text-[10px] font-medium text-emerald-400">
            Votre partie solo sera sauvegardée automatiquement.
          </p>
        )}
      </motion.div>
    );
  }

  // ---- Carte complète (accueil, lobby) ----
  return (
    <motion.div
      {...motionProps}
      role="alert"
      className="pointer-events-auto relative flex w-full max-w-sm flex-col gap-3 overflow-hidden rounded-2xl border border-amber-500/50 bg-slate-900/95 p-3.5 shadow-2xl backdrop-blur-xl"
    >
      <div className="absolute inset-x-0 top-0 h-1 bg-slate-800">
        <div
          className={`h-full transition-all duration-1000 ease-linear ${urgent ? 'bg-rose-500' : 'bg-amber-400'}`}
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="flex items-center gap-2.5 pt-0.5">
        {avatar}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-sm font-black text-white">{invitation.fromUserName} te lance un défi</span>
            {timerPill}
          </div>
          <span className="block truncate text-[11px] text-slate-400">
            Table <strong>#{invitation.roomCode}</strong> · Mise{' '}
            <strong className="text-amber-400">{invitation.baseBet} jetons</strong>
            {othersCount > 0 ? ` · +${othersCount} autre${othersCount > 1 ? 's' : ''} en attente` : ''}
          </span>
          {willSaveSolo && (
            <span className="mt-0.5 block truncate text-[10px] font-medium text-emerald-400">
              Votre partie solo sera sauvegardée automatiquement.
            </span>
          )}
        </div>
        <button
          type="button"
          aria-label="Fermer la notification"
          onClick={() => {
            triggerHaptic('light');
            onDismiss(invitation.id);
          }}
          className="-mr-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-800 text-slate-400 transition hover:bg-slate-700 hover:text-white active:scale-95"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex items-center gap-2 border-t border-slate-800/80 pt-2.5">
        {onBlock && (
          <button
            type="button"
            title="Bloquer ce joueur"
            onClick={block}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 transition active:scale-95 cursor-pointer"
          >
            <UserX className="h-4 w-4" />
          </button>
        )}
        <button
          type="button"
          onClick={decline}
          className="h-11 flex-1 rounded-xl bg-slate-800 text-xs font-bold text-slate-300 transition hover:bg-slate-700 hover:text-white active:scale-95"
        >
          Refuser
        </button>
        <button
          type="button"
          onClick={accept}
          className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 text-xs font-black text-slate-950 shadow-md shadow-emerald-500/20 transition active:scale-95"
        >
          <Check className="h-3.5 w-3.5 shrink-0" />
          Rejoindre
        </button>
      </div>
    </motion.div>
  );
};
