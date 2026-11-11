import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { Inbox, Loader2, ShieldAlert, Swords, Table2, UserX, Users, Wifi, Wallet } from 'lucide-react';
import type { GameInvitation, MultiplayerRoom } from '../../types';
import { NativeScreenHeader } from '../common/NativeScreenHeader';
import { NativeSegmentedNav, SegmentTab } from '../common/NativeSegmentedNav';
import { PlayerAvatar } from '../profile/PlayerAvatar';
import { OpenTablesPanel } from './OpenTablesPanel';
import { FriendsPanel } from './FriendsPanel';
import { ActiveGameConflict, ActiveGameConflictModal, AuthRequirementModal } from './HubDialogs';
import { useFriendsHub } from '../../hooks/useFriendsHub';
import { useFriendChallenges } from '../../hooks/useFriendChallenges';
import { useBackLayer } from '../../hooks/useBackLayer';
import { useInvitations } from '../../context/InvitationsContext';
import { getLocalPlayerName } from '../../services/identity';
import type { MultiplayerScreenProps } from '../multiplayer/MultiplayerScreen';
import { AlertTriangle, Check, X } from 'lucide-react';
import { usePlayerProfile } from '../../context/PlayerProfileContext';
import { useVisibleInterval } from '../../hooks/useVisibleInterval';
import { getPublicParamNumber } from '../../services/publicConfig';
import { wsService } from '../../services/websocketService';
import { formatFcfa } from '../../services/koraCashFormat';
import { triggerHaptic } from '../../utils/sound';
import { SocialMode, SocialSubTab, countInvitations, invitationsForMode, readStoredSocialMode, resolveSocialMode, splitSeatedTable, storeSocialMode } from '../../utils/socialCenter';

interface SocialScreenProps {
  onClose: () => void;
  invitations: GameInvitation[];
  onAccept: (invitation: GameInvitation) => void;
  onDecline: (invitation: GameInvitation) => void;
  onBlock: (invitation: GameInvitation) => void;
  /** Table où le joueur est assis, s'il y en a une. */
  room: MultiplayerRoom | null;
  onResumeTable: (room: MultiplayerRoom) => void;
  onOpenMultiplayer: () => void;
  onOpenKoraCash: () => void;
  /** Rejoint un salon par son code et dit si cela a réussi. */
  onJoinCode: (code: string) => Promise<{ success: boolean; error?: string }>;
  /** Le côté Kora Cash est-il disponible (interrupteurs katika, Kora Cash ouvert, compte Google) ? */
  cashAvailable: boolean;
  localPlayerId: string;
  /** Crée une table (pour défier un ami) : même fonction que celle de l'écran Multijoueur. */
  onCreateRoom: MultiplayerScreenProps['onCreateRoom'];
  /** Sous-onglet d'amis ouvert d'emblée (ex. demandes reçues, depuis une notification). */
  initialFriendSubTab?: 'FRIENDS' | 'RECEIVED' | 'SENT';
  /** Sous-onglet ouvert d'emblée (ex. depuis une notification d'ami). */
  initialSubTab?: SocialSubTab;
}

const primaryButton =
  'w-full h-10 rounded-xl bg-gradient-to-r from-amber-400 to-amber-600 text-slate-950 font-black text-xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50';
const secondaryButton = 'w-full h-10 rounded-xl bg-slate-900 border border-slate-700 text-slate-200 font-bold text-xs cursor-pointer hover:border-amber-500/50';

const Empty: React.FC<{ icon: React.ReactNode; title: string; text: string }> = ({ icon, title, text }) => (
  <div className="py-10 px-6 rounded-3xl bg-slate-900/40 border border-slate-800/80 flex flex-col items-center text-center gap-3">
    <div className="w-14 h-14 rounded-full bg-slate-800 flex items-center justify-center text-slate-400">{icon}</div>
    <h3 className="text-sm font-bold text-slate-200">{title}</h3>
    <p className="text-xs text-slate-400 max-w-[260px] leading-relaxed">{text}</p>
  </div>
);

const InvitationCard: React.FC<{
  invitation: GameInvitation;
  secondsLeft: number;
  onAccept: () => void;
  onDecline: () => void;
  onBlock: () => void;
}> = ({ invitation, secondsLeft, onAccept, onDecline, onBlock }) => {
  const isCash = invitation.cash === true;
  return (
    <div className={`p-3.5 rounded-2xl bg-slate-900 border shadow-md flex flex-col gap-2.5 ${isCash ? 'border-amber-500/60' : 'border-slate-700'}`}>
      <div className="flex items-center gap-2.5">
        <PlayerAvatar avatarId={(invitation.fromUserAvatar as any) || 'avatar_1'} size="sm" className="w-9 h-9 shrink-0" />
        <div className="min-w-0 flex-1">
          <span className="block truncate text-sm font-black text-white">
            {invitation.fromUserName} {isCash ? 't’invite à une table Kora Cash' : 'te lance un défi'}
          </span>
          <span className="block truncate text-xs text-slate-400">
            {isCash
              ? `Table #${invitation.roomCode} · Mise ${formatFcfa(invitation.baseBet)}${invitation.rakePercent !== undefined ? ` · Commission ${invitation.rakePercent} %` : ''}`
              : `Table #${invitation.roomCode} · Mise ${invitation.baseBet} jetons`}
          </span>
        </div>
        <span className={`shrink-0 text-xs font-black px-2 py-0.5 rounded-full border ${secondsLeft <= 15 ? 'bg-rose-500/15 text-rose-300 border-rose-500/40' : 'bg-slate-800 text-slate-300 border-slate-700'}`}>
          {secondsLeft} s
        </span>
      </div>
      {isCash && <p className="text-xs text-amber-200/90">Argent réel, réservé aux 18 ans et plus. Tu peux perdre ta mise.</p>}
      <div className="grid grid-cols-3 gap-2">
        <button type="button" onClick={onBlock} className="h-9 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 text-xs font-bold flex items-center justify-center gap-1 cursor-pointer">
          <UserX className="w-3.5 h-3.5" />
          <span>Bloquer</span>
        </button>
        <button type="button" onClick={onDecline} className="h-9 rounded-xl bg-slate-800 text-slate-300 text-xs font-bold hover:bg-slate-700 cursor-pointer">
          Refuser
        </button>
        <button type="button" onClick={onAccept} className="h-9 rounded-xl bg-emerald-500 text-slate-950 text-xs font-black hover:bg-emerald-400 cursor-pointer shadow-md">
          {isCash ? 'Voir la table' : 'Rejoindre'}
        </button>
      </div>
    </div>
  );
};

/** Page Social : invitations, amis, joueurs en ligne et tables. Jeu gratuit et Kora Cash y sont strictement séparés. */
export const SocialScreen: React.FC<SocialScreenProps> = ({
  onClose,
  invitations,
  onAccept,
  onDecline,
  onBlock,
  room,
  onResumeTable,
  onOpenMultiplayer,
  onOpenKoraCash,
  onJoinCode,
  cashAvailable,
  localPlayerId,
  onCreateRoom,
  initialFriendSubTab,
  initialSubTab = 'INVITATIONS',
}) => {
  const { isLoggedIn, loginWithGoogle, profile } = usePlayerProfile();
  const { declineInvitation: declineIncomingInvitation } = useInvitations();
  const playerName = profile?.displayName || getLocalPlayerName();

  // Amis : même logique que l'écran Multijoueur, ici sans lui.
  const [hubErrorMsg, setHubErrorMsg] = useState<string | null>(null);
  const [hubSuccessMsg, setHubSuccessMsg] = useState<string | null>(null);
  const [, setIsHubLoading] = useState<boolean>(false);
  const [activeGameConflict, setActiveGameConflict] = useState<ActiveGameConflict | null>(null);
  const [showAuthRequirementModal, setShowAuthRequirementModal] = useState<boolean>(false);
  const [authRequirementReason, setAuthRequirementReason] = useState<string>('');
  const [showAddFriendModal, setShowAddFriendModal] = useState<boolean>(false);
  const [showQrModal, setShowQrModal] = useState<boolean>(false);
  const friendsHub = useFriendsHub({
    isOpen: true,
    room,
    embedded: initialSubTab === 'ONLINE' ? 'ONLINE' : 'FRIENDS',
    initialFriendSubTab,
    activeTab: 'social',
    isLoggedIn,
    profile,
    incomingInvitations: invitations,
    declineInvitation: declineIncomingInvitation,
    setHubSuccessMsg,
    setHubErrorMsg,
    setAuthRequirementReason,
    setShowAuthRequirementModal,
    setShowAddFriendModal,
  });
  const friendChallenges = useFriendChallenges({
    isLoggedIn,
    room,
    playerName,
    onCreateRoom,
    friendsPresenceMap: friendsHub.friendsPresenceMap,
    setIsLoading: setIsHubLoading,
    setHubSuccessMsg,
    setHubErrorMsg,
    setAuthRequirementReason,
    setShowAuthRequirementModal,
    setActiveGameConflict,
  });
  const anyDialogOpen = Boolean(activeGameConflict) || showAuthRequirementModal || showAddFriendModal || showQrModal;
  useBackLayer(anyDialogOpen, () => {
    if (activeGameConflict) setActiveGameConflict(null);
    else if (showAuthRequirementModal) setShowAuthRequirementModal(false);
    else if (showAddFriendModal) setShowAddFriendModal(false);
    else setShowQrModal(false);
  });
  const [isHubAuthLoading, setIsHubAuthLoading] = useState<boolean>(false);
  const handleHubGoogleSignIn = async () => {
    setIsHubAuthLoading(true);
    try {
      await loginWithGoogle();
      setShowAuthRequirementModal(false);
      setHubSuccessMsg('Compte Google connecté.');
      triggerHaptic('success');
    } catch (err) {
      setHubErrorMsg(err instanceof Error && err.message ? err.message : 'La connexion Google a échoué. Réessaie.');
      triggerHaptic('heavy');
    } finally {
      setIsHubAuthLoading(false);
    }
  };
  const [requestedMode, setRequestedMode] = useState<SocialMode | null>(() => readStoredSocialMode());
  const [subTab, setSubTab] = useState<SocialSubTab>(initialSubTab);

  // La vue « En ligne » et la vue « Amis » partagent le même état d'amis : on aligne son sous-onglet sur celui de la page.
  const { friendSubTab: hubFriendSubTab, setFriendSubTab: setHubFriendSubTab } = friendsHub;
  useEffect(() => {
    if (subTab === 'ONLINE') {
      if (hubFriendSubTab !== 'ONLINE') setHubFriendSubTab('ONLINE');
    } else if (subTab === 'FRIENDS' && hubFriendSubTab === 'ONLINE') {
      setHubFriendSubTab(initialFriendSubTab ?? 'FRIENDS');
    }
  }, [subTab, hubFriendSubTab, setHubFriendSubTab, initialFriendSubTab]);
  const [now, setNow] = useState<number>(() => wsService.getServerTime());
  const [authBusy, setAuthBusy] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const mode = resolveSocialMode(requestedMode, cashAvailable);
  const isCash = mode === 'CASH';

  useVisibleInterval(() => setNow(wsService.getServerTime()), getPublicParamNumber('clientCountdownTickSeconds') * 1000);

  // Côté Kora Cash : ni amis ni joueurs en ligne (ils invitent à des tables gratuites). On revient aux invitations.
  useEffect(() => {
    if (isCash && (subTab === 'FRIENDS' || subTab === 'ONLINE')) setSubTab('INVITATIONS');
  }, [isCash, subTab]);

  const counts = useMemo(() => countInvitations(invitations, cashAvailable, now), [invitations, cashAvailable, now]);
  const visibleInvitations = useMemo(() => invitationsForMode(invitations, mode, now), [invitations, mode, now]);
  const seated = splitSeatedTable(room);
  const myTable = isCash ? seated.cash : seated.free;
  const otherModeTable = isCash ? seated.free : seated.cash;

  const chooseMode = (next: SocialMode) => {
    triggerHaptic('light');
    setRequestedMode(next);
    storeSocialMode(next);
  };

  const signIn = async () => {
    setAuthBusy(true);
    setAuthError(null);
    try {
      await loginWithGoogle();
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'La connexion Google a échoué. Réessaie.');
    } finally {
      setAuthBusy(false);
    }
  };

  const tabs: SegmentTab<SocialSubTab>[] = isCash
    ? [
        { id: 'INVITATIONS', label: 'Invitations', shortLabel: 'Invitations', icon: Inbox, badge: counts.cash > 0 ? String(counts.cash) : undefined, badgeColor: 'bg-rose-500 text-white' },
        { id: 'TABLES', label: 'Tables', shortLabel: 'Tables', icon: Table2 },
      ]
    : [
        { id: 'INVITATIONS', label: 'Invitations', shortLabel: 'Invit.', icon: Inbox, badge: counts.free > 0 ? String(counts.free) : undefined, badgeColor: 'bg-rose-500 text-white' },
        { id: 'FRIENDS', label: 'Amis', shortLabel: 'Amis', icon: Users },
        { id: 'ONLINE', label: 'En ligne', shortLabel: 'En ligne', icon: Wifi },
        { id: 'TABLES', label: 'Tables', shortLabel: 'Tables', icon: Table2 },
      ];

  return (
    <motion.div
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      id="social-screen"
      className="fixed inset-x-0 top-0 bottom-[var(--app-bottom-nav,0px)] z-[64] bg-slate-950 text-slate-100 flex flex-col overflow-hidden comfort-ui"
    >
      <NativeScreenHeader id="social-header" backLabel="Retour" onBack={onClose} backTitle="Retourner à l’accueil" title="Social" subtitle="Amis, invitations et tables" />

      {!isLoggedIn ? (
        <main className="flex-1 overflow-y-auto no-scrollbar p-3.5 sm:p-6 max-w-lg mx-auto w-full flex flex-col gap-3.5">
          <Empty
            icon={<Users className="w-7 h-7" />}
            title="Retrouve tes amis"
            text="Connecte-toi avec Google pour voir tes invitations, tes amis, les joueurs en ligne et tes tables."
          />
          <button type="button" disabled={authBusy} onClick={() => void signIn()} className={primaryButton}>
            {authBusy && <Loader2 className="w-4 h-4 animate-spin" />}
            <span>Se connecter avec Google</span>
          </button>
          {authError && <p className="text-xs font-bold text-rose-300 text-center">{authError}</p>}
        </main>
      ) : (
        <>
          {cashAvailable && (
            <div className="shrink-0 px-3 sm:px-6 pt-2.5">
              <div className="max-w-lg mx-auto grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-slate-900 border border-slate-800" role="group" aria-label="Mode de jeu">
                <button
                  type="button"
                  aria-pressed={!isCash}
                  onClick={() => chooseMode('FREE')}
                  className={`h-10 rounded-lg text-xs font-black flex items-center justify-center gap-1.5 cursor-pointer ${!isCash ? 'bg-emerald-500 text-slate-950 shadow-sm' : 'text-slate-400 hover:text-white'}`}
                >
                  <Swords className="w-3.5 h-3.5" />
                  <span>Gratuit{counts.free > 0 ? ` (${counts.free})` : ''}</span>
                </button>
                <button
                  type="button"
                  aria-pressed={isCash}
                  onClick={() => chooseMode('CASH')}
                  className={`h-10 rounded-lg text-xs font-black flex items-center justify-center gap-1.5 cursor-pointer ${isCash ? 'bg-amber-500 text-slate-950 shadow-sm' : 'text-slate-400 hover:text-white'}`}
                >
                  <Wallet className="w-3.5 h-3.5" />
                  <span>Kora Cash{counts.cash > 0 ? ` (${counts.cash})` : ''}</span>
                </button>
              </div>
            </div>
          )}

          {isCash && (
            <div id="social-cash-banner" className="shrink-0 mt-2 px-3 sm:px-6 py-2 border-y bg-amber-500/10 border-amber-500/30">
              <p className="max-w-lg mx-auto flex items-center gap-1.5 text-xs font-black text-amber-200">
                <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                <span>Argent réel, réservé aux 18 ans et plus. Tu peux perdre ta mise.</span>
              </p>
            </div>
          )}

          <NativeSegmentedNav tabs={tabs} activeTab={subTab} onChange={(id) => { triggerHaptic('light'); setSubTab(id); }} ariaLabel="Navigation Social" />

          <main className="flex-1 overflow-y-auto no-scrollbar p-3.5 sm:p-6 max-w-lg mx-auto w-full flex flex-col gap-3.5">
            {subTab === 'INVITATIONS' && (
              <>
                {visibleInvitations.length === 0 ? (
                  <Empty
                    icon={<Inbox className="w-7 h-7" />}
                    title={isCash ? 'Aucune invitation Kora Cash' : 'Aucune invitation'}
                    text={
                      isCash
                        ? 'Les invitations à une table Kora Cash arrivent ici. Tu choisis toujours toi-même ton entrée à la table.'
                        : 'Quand un ami te défie, son invitation apparaît ici pendant deux minutes.'
                    }
                  />
                ) : (
                  visibleInvitations.map((inv) => (
                    <InvitationCard
                      key={inv.id}
                      invitation={inv}
                      secondsLeft={Math.max(0, Math.ceil((inv.expiresAt - now) / 1000))}
                      onAccept={() => onAccept(inv)}
                      onDecline={() => onDecline(inv)}
                      onBlock={() => onBlock(inv)}
                    />
                  ))
                )}
              </>
            )}

            {!isCash && friendsHub.friendAcceptedToast && (
              <div className="p-3 rounded-2xl bg-emerald-500/20 border border-emerald-500/50 text-emerald-200 flex items-center justify-between gap-3 shadow-lg">
                <div className="flex items-center gap-2.5 min-w-0">
                  <PlayerAvatar avatarId={(friendsHub.friendAcceptedToast.avatarId as any) || 'avatar_1'} size="sm" className="w-8 h-8 shrink-0 ring-2 ring-emerald-400" />
                  <div className="flex flex-col min-w-0">
                    <span className="text-xs font-black text-white truncate">{friendsHub.friendAcceptedToast.name} a accepté ta demande !</span>
                    <span className="text-xs text-emerald-300/90 font-medium truncate">Vous êtes désormais amis.</span>
                  </div>
                </div>
                <button type="button" aria-label="Fermer" onClick={() => friendsHub.setFriendAcceptedToast(null)} className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-300 hover:text-white flex items-center justify-center shrink-0 cursor-pointer">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {!isCash && (hubErrorMsg || hubSuccessMsg) && (
              <div
                className={`p-3 rounded-xl border text-xs font-bold flex items-center justify-between gap-2 ${
                  hubErrorMsg ? 'bg-rose-500/10 border-rose-500/30 text-rose-300' : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                }`}
              >
                <span className="flex items-center gap-2 min-w-0">
                  {hubErrorMsg ? <AlertTriangle className="w-4 h-4 shrink-0" /> : <Check className="w-4 h-4 shrink-0" />}
                  <span>{hubErrorMsg || hubSuccessMsg}</span>
                </span>
                <button
                  type="button"
                  aria-label="Fermer le message"
                  onClick={() => (hubErrorMsg ? setHubErrorMsg(null) : setHubSuccessMsg(null))}
                  className="p-1 hover:text-white cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {!isCash && (subTab === 'FRIENDS' || subTab === 'ONLINE') && (
              <FriendsPanel
                key={subTab}
                hub={friendsHub}
                challenges={friendChallenges}
                embedded={subTab}
                isLoggedIn={isLoggedIn}
                profile={profile}
                localPlayerId={localPlayerId}
                playerName={playerName}
                room={room}
                isAuthLoading={isHubAuthLoading}
                onJoinRoomCode={(code) => void onJoinCode(code)}
                onGoogleSignIn={() => void handleHubGoogleSignIn()}
                incomingInvitations={[]}
                onAcceptInvite={() => undefined}
                onDeclineInvite={() => undefined}
                setHubErrorMsg={setHubErrorMsg}
                setHubSuccessMsg={setHubSuccessMsg}
                showAddFriendModal={showAddFriendModal}
                setShowAddFriendModal={setShowAddFriendModal}
                showQrModal={showQrModal}
                setShowQrModal={setShowQrModal}
              />
            )}

            {subTab === 'TABLES' && (
              <>
                <span className="text-xs font-black uppercase tracking-wider text-slate-400">{isCash ? 'Ma table Kora Cash' : 'Ma table'}</span>
                {myTable && room ? (
                  <div className={`p-3.5 rounded-2xl bg-slate-900 border flex flex-col gap-2.5 ${isCash ? 'border-amber-500/60' : 'border-slate-700'}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-black text-white">Table #{myTable.id}</span>
                      <span className="text-xs font-bold text-slate-300">{myTable.status === 'LOBBY' ? 'En attente' : 'En cours'}</span>
                    </div>
                    <span className="text-xs text-slate-400">
                      {myTable.seated}/{myTable.capacity} joueurs · Mise {isCash ? formatFcfa(myTable.baseBet) : `${myTable.baseBet} jetons`}
                    </span>
                    <button type="button" onClick={() => onResumeTable(room)} className={primaryButton}>
                      Reprendre
                    </button>
                  </div>
                ) : (
                  <Empty
                    icon={<Table2 className="w-7 h-7" />}
                    title={isCash ? 'Aucune table Kora Cash en cours' : 'Aucune table en cours'}
                    text={isCash ? 'Ouvre une table dans Kora Cash : tu y choisis ta mise et ton entrée.' : 'Crée une table ou rejoins un salon depuis Multijoueur.'}
                  />
                )}

                {otherModeTable && (
                  <button
                    type="button"
                    onClick={() => chooseMode(isCash ? 'FREE' : 'CASH')}
                    className="text-left text-xs font-bold text-slate-300 underline underline-offset-2 cursor-pointer"
                  >
                    {isCash ? 'Tu as une table gratuite en cours. La voir' : 'Tu as une table Kora Cash en cours. La voir'}
                  </button>
                )}

                <OpenTablesPanel mode={mode} onJoinCode={onJoinCode} onOpenKoraCash={onOpenKoraCash} />

                {isCash ? (
                  <button type="button" onClick={onOpenKoraCash} className={primaryButton}>
                    <Wallet className="w-4 h-4" />
                    <span>Tables Kora Cash</span>
                  </button>
                ) : (
                  <button type="button" onClick={onOpenMultiplayer} className={secondaryButton}>
                    Salons et création de table (Multijoueur)
                  </button>
                )}
              </>
            )}
          </main>
        </>
      )}
      <AuthRequirementModal
        open={showAuthRequirementModal}
        reason={authRequirementReason}
        isAuthLoading={isHubAuthLoading}
        onGoogleSignIn={() => void handleHubGoogleSignIn()}
        onClose={() => setShowAuthRequirementModal(false)}
      />
      <ActiveGameConflictModal
        conflict={activeGameConflict}
        setConflict={setActiveGameConflict}
        onReturnToGame={(code) => void onJoinCode(code)}
      />
    </motion.div>
  );
};
