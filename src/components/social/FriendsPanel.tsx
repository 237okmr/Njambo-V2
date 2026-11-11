import React from 'react';
import { getPublicParamNumber } from '../../services/publicConfig';
import { useVisibleInterval } from '../../hooks/useVisibleInterval';
import { getTurnTimerChoices } from '../../../server/engine/engineParams';
import {
  Users,
  Globe,
  PlusCircle,
  ArrowLeft,
  Crown,
  Copy,
  Check,
  Play,
  Share2,
  ClipboardPaste,
  Mail,
  UserPlus,
  UserCheck,
  UserX,
  RefreshCw,
  Flame,
  Clock,
  Sliders,
  Trash2,
  Lock,
  Unlock,
  AlertTriangle,
  AlertCircle,
  X,
  KeyRound,
  ShieldCheck,
  Settings,
  Bot,
  Zap,
  Coins,
  QrCode,
  MessageCircle,
  Sparkles,
  Swords,
  Radio,
  Eye,
  Trophy,
  LogOut,
  Search,
  Send,
  Inbox,
  ShieldAlert,
  ChevronDown,
  ChevronRight,
  Wifi,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import {
  MultiplayerRoom,
  RoomPlayer,
  PublicRoomSummary,
  GameInvitation,
  LocalContact,
  FriendDocument,
  UserPresence,
  PresenceStatus,
} from '../../types';
import { triggerHaptic, sounds } from '../../utils/sound';
import { getLocalPlayerName } from '../../services/identity';
import { FriendService } from '../../services/friendService';
import { OnlinePlayersPanel } from '../multiplayer/OnlinePlayersPanel';
import type { OnlinePlayer } from '../../services/websocketService';
import { notificationNavigation } from '../../services/notificationNavigation';
import { webSocketService } from '../../services/websocketService';
import { isTestEnvironment } from '../../utils/envUtils';
import { PlayerAvatar } from '../profile/PlayerAvatar';
import { RoomFilterBottomSheet, AdvancedRoomFilters } from '../multiplayer/RoomFilterBottomSheet';
import { FriendQrModal } from '../multiplayer/FriendQrModal';
import { getPwaShareBase } from '../../utils/pwaLinks';
import { buildCashInviteText, buildCashInviteUrl, buildCashInviteWhatsAppUrl } from '../../utils/cashInvite';
import { JoinProgressIndicator } from '../multiplayer/JoinProgressIndicator';
import { HeadToHeadModal } from '../rivalry/HeadToHeadModal';
import { usePlayerProfile } from '../../context/PlayerProfileContext';
import { useInvitations } from '../../context/InvitationsContext';
import { NativeScreenHeader } from '../common/NativeScreenHeader';
import { NativeSegmentedNav, SegmentTab } from '../common/NativeSegmentedNav';
import { GoogleIcon } from '../common/GoogleIcon';
import { useBackLayer } from '../../hooks/useBackLayer';

import type { useFriendsHub } from '../../hooks/useFriendsHub';
import type { useFriendChallenges } from '../../hooks/useFriendChallenges';

export interface FriendsPanelProps {
  hub: ReturnType<typeof useFriendsHub>;
  challenges: ReturnType<typeof useFriendChallenges>;
  /** Mode intégré à la page Social : une seule vue (amis ou joueurs en ligne), sans bloc d'invitations. */
  embedded?: 'FRIENDS' | 'ONLINE';
  isLoggedIn: boolean;
  profile: ReturnType<typeof usePlayerProfile>['profile'];
  localPlayerId: string;
  playerName: string;
  room: MultiplayerRoom | null;
  isAuthLoading: boolean;
  /** Rejoint la table d'un ami par son code. */
  onJoinRoomCode: (code: string) => void;
  onGoogleSignIn: () => void;
  incomingInvitations: GameInvitation[];
  onAcceptInvite: (invite: GameInvitation) => void;
  onDeclineInvite: (invite: GameInvitation) => void;
  setHubErrorMsg: (message: string | null) => void;
  setHubSuccessMsg: (message: string | null) => void;
  showAddFriendModal: boolean;
  setShowAddFriendModal: (open: boolean) => void;
  showQrModal: boolean;
  setShowQrModal: (open: boolean) => void;
}

/** Amis, demandes, joueurs en ligne, fenêtres « ajouter un ami », « mon code » et « face-à-face ». Partagé par Multijoueur et Social. */
export const FriendsPanel: React.FC<FriendsPanelProps> = ({
  hub, challenges, embedded, isLoggedIn, profile, localPlayerId, playerName, room, isAuthLoading, onJoinRoomCode: handleJoin, onGoogleSignIn,
  incomingInvitations, onAcceptInvite: handleAcceptInvite, onDeclineInvite: handleDeclineInvite,
  setHubErrorMsg, setHubSuccessMsg, showAddFriendModal, setShowAddFriendModal, showQrModal, setShowQrModal,
}) => {
  const {
    setLocalContacts, setRecentPlayers, recentPlayers, friendSubTab, setFriendSubTab, friendsPresenceMap, newFriendInput,
    setNewFriendInput, isSearchingFriends, friendSearchResults, setFriendSearchResults, friendActionPendingMap,
    setFriendActionPendingMap, selectedH2HOpponent, setSelectedH2HOpponent, acceptedFriends, pendingReceivedRequests,
    pendingSentRequests, onlineFriendIds, handleAcceptFriendRequest, handleDeclineFriendRequest, handleCancelSentRequest,
    handleRemoveFriend, handleBlockPlayer, handleSearchFriend, handleSendFriendRequest, handleAddFriendLegacyFallback,
  } = hub;
  const { handleChallengeFriend, handleInviteOnlinePlayer, handleWhatsAppInviteFriend } = challenges;
  const handleGoogleSignIn = onGoogleSignIn;

  return (
    <>
            <div className="flex flex-col gap-3">
              {/* Rappel discret pour les invités : la liste d'amis dépend du navigateur */}
              {!isLoggedIn && (
                <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-slate-900/60 border border-slate-800">
                  <span className="text-xs text-slate-300 min-w-0">En invité, tes amis sont perdus si le navigateur est nettoyé.</span>
                  <button
                    type="button"
                    id="btn-social-tab-google-login"
                    disabled={isAuthLoading}
                    onClick={handleGoogleSignIn}
                    className="shrink-0 min-h-9 text-xs font-bold text-amber-300 hover:text-amber-200 underline underline-offset-2 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <GoogleIcon className="w-3.5 h-3.5 shrink-0" />
                    <span>{isAuthLoading ? '...' : 'Sauvegarder avec Google'}</span>
                  </button>
                </div>
              )}

              {/* Invitations Received */}
              {incomingInvitations.length > 0 && !embedded && (
                <div className="flex flex-col gap-2">
                  <span className="text-xs font-black uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5" /> Invitations reçues ({incomingInvitations.length})
                  </span>
                  <div className="flex flex-col gap-2">
                    {incomingInvitations.map((inv, idx) => (
                      <div
                        key={`${inv.id}_${idx}`}
                        className="p-3.5 rounded-2xl bg-slate-900 border border-amber-500/40 shadow-md flex flex-col gap-2.5"
                      >
                        <div className="flex items-center gap-2.5">
                          <PlayerAvatar
                            avatarId={(inv.fromUserAvatar as any) || 'avatar_1'}
                            size="sm"
                            className="w-8 h-8"
                          />
                          <div className="flex flex-col">
                            <span className="text-xs font-black text-white">{inv.fromUserName} te défie !</span>
                            <span className="text-xs text-slate-400">
                              Table #{inv.roomCode} · {inv.cash ? `${inv.baseBet} FCFA · argent réel` : `${inv.baseBet} jetons`}
                            </span>
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-2">
                          <button
                            type="button"
                            onClick={() => handleBlockPlayer(inv.fromUserId, inv.fromUserName)}
                            className="h-9 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 text-xs font-bold transition cursor-pointer flex items-center justify-center gap-1"
                          >
                            <UserX className="w-3.5 h-3.5" />
                            <span>Bloquer</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeclineInvite(inv)}
                            className="h-9 rounded-xl bg-slate-800 text-slate-300 text-xs font-bold hover:bg-slate-700 cursor-pointer"
                          >
                            Refuser
                          </button>
                          <button
                            type="button"
                            onClick={() => handleAcceptInvite(inv)}
                            className="h-9 rounded-xl bg-emerald-500 text-slate-950 text-xs font-black hover:bg-emerald-400 cursor-pointer shadow-md"
                          >
                            {inv.cash ? 'Voir la table' : 'Rejoindre'}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Compact Friend Code Bar */}
              <div className="px-3.5 py-2 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center justify-between gap-2 shadow-sm">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs uppercase font-bold text-slate-400 shrink-0">Code :</span>
                  <span className="text-xs font-black text-amber-400 font-mono tracking-wide truncate">
                    {FriendService.getFriendCode(localPlayerId, profile?.friendCode)}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {isLoggedIn && (
                    <span
                      className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center"
                      title="Code associé à ton compte Google"
                    >
                      <Check className="w-4 h-4" />
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowQrModal(true)}
                    className="w-8 h-8 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center justify-center transition active:scale-95 cursor-pointer"
                    title="Afficher le QR code"
                  >
                    <QrCode className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Social Sub-Tabs Header & Action (Restructured into 2 rows) */}
              <div className="flex flex-col gap-2.5">
                {/* Row 1: Full-width sub-tab pills */}
                {embedded !== 'ONLINE' && (
                <div className={`grid ${embedded ? 'grid-cols-3' : 'grid-cols-2 sm:grid-cols-4'} gap-1.5 p-1 rounded-xl bg-slate-900 border border-slate-800 w-full`}>
                  <button
                    type="button"
                    onClick={() => setFriendSubTab('FRIENDS')}
                    className={`h-9 px-2 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer w-full ${
                      friendSubTab === 'FRIENDS'
                        ? 'bg-amber-500 text-slate-950 font-black shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <Users className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">
                      Mes amis{acceptedFriends.length > 0 ? ` (${acceptedFriends.length})` : ''}
                    </span>
                  </button>

                  {!embedded && (
                  <button
                    type="button"
                    onClick={() => setFriendSubTab('ONLINE')}
                    className={`h-9 px-2 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer w-full ${
                      friendSubTab === 'ONLINE'
                        ? 'bg-amber-500 text-slate-950 font-black shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <Wifi className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">En ligne</span>
                  </button>
                  )}

                  <button
                    type="button"
                    onClick={() => setFriendSubTab('RECEIVED')}
                    className={`h-9 px-2 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 relative cursor-pointer w-full ${
                      friendSubTab === 'RECEIVED'
                        ? 'bg-amber-500 text-slate-950 font-black shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <Inbox className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">
                      Reçues{pendingReceivedRequests.length > 0 ? ` (${pendingReceivedRequests.length})` : ''}
                    </span>
                    {pendingReceivedRequests.length > 0 && (
                      <span className="ml-0.5 px-1.5 py-0.2 bg-rose-500 text-white text-xs font-black rounded-full animate-pulse shadow-sm shrink-0">
                        {pendingReceivedRequests.length}
                      </span>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => setFriendSubTab('SENT')}
                    className={`h-9 px-2 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer w-full ${
                      friendSubTab === 'SENT'
                        ? 'bg-amber-500 text-slate-950 font-black shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <Send className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">
                      Envoyées{pendingSentRequests.length > 0 ? ` (${pendingSentRequests.length})` : ''}
                    </span>
                  </button>
                </div>
                )}

                {/* Row 2: Full-width add friend button */}
                {friendSubTab !== 'ONLINE' && (
                <button
                  type="button"
                  onClick={() => {
                    setFriendSearchResults([]);
                    setNewFriendInput('');
                    setShowAddFriendModal(true);
                  }}
                  className="w-full h-10 px-4 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 text-xs font-black flex items-center justify-center gap-2 shadow-md shadow-amber-500/10 cursor-pointer transition active:scale-95"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>+ Ajouter un ami</span>
                </button>
                )}
              </div>

              {/* VUE : JOUEURS EN LIGNE */}
              {friendSubTab === 'ONLINE' && (
                <OnlinePlayersPanel
                  isLoggedIn={isLoggedIn}
                  isAuthLoading={isAuthLoading}
                  onSignIn={handleGoogleSignIn}
                  friendIds={onlineFriendIds}
                  onInvite={handleInviteOnlinePlayer}
                />
              )}

              {/* VIEW 1 : MES AMIS */}
              {friendSubTab === 'FRIENDS' && (
                <>
                  {acceptedFriends.length === 0 ? (
                    <div className="py-12 px-6 rounded-3xl bg-slate-900/40 border border-slate-800/80 flex flex-col items-center justify-center text-center gap-4 relative overflow-hidden">
                      <div className="w-16 h-16 rounded-full bg-amber-500/10 flex items-center justify-center mb-2">
                        <Users className="w-8 h-8 text-amber-400 opacity-80" />
                      </div>
                      <div className="flex flex-col gap-1">
                        <h3 className="text-sm font-black text-slate-200">Tu joues seul ?</h3>
                        <p className="text-xs text-slate-400 max-w-[250px] leading-relaxed">
                          Ta liste d'amis est vide. Recherche des joueurs par code ami ou invite tes proches par WhatsApp !
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setFriendSearchResults([]);
                          setNewFriendInput('');
                          setShowAddFriendModal(true);
                        }}
                        className="mt-2 h-10 px-6 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-xs sm:text-sm shadow-xl shadow-amber-500/20 flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-95 animate-pulse"
                      >
                        <UserPlus className="w-4 h-4" />
                        <span>Ajouter un ami</span>
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {acceptedFriends.map((c: any, idx) => {
                        const friendId = c.friendUid || c.id;
                        const friendName = c.displayName || c.name;
                        const friendAvatar = c.avatarId || c.avatarSeed || 'avatar_1';
                        const friendCode = c.friendCode || FriendService.getFriendCode(friendId);
                        const presence = friendsPresenceMap[friendId];
                        const status: PresenceStatus = presence ? presence.status : 'OFFLINE';
                        const currentRoomCode = presence?.currentRoomCode;
                        const summary = presence?.currentRoomSummary;

                        let badgeText = '⚪ Hors ligne';
                        let badgeStyle = 'bg-slate-800/80 text-slate-400 border-slate-700/60';
                        let dotStyle = 'bg-slate-500';

                        if (status === 'ONLINE_IDLE') {
                          badgeText = '🟢 Disponible';
                          badgeStyle = 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
                          dotStyle = 'bg-emerald-400';
                        } else if (status === 'IN_SOLO') {
                          badgeText = '🟡 En solo';
                          badgeStyle = 'bg-amber-500/15 text-amber-300 border-amber-500/30';
                          dotStyle = 'bg-amber-400';
                        } else if (status === 'IN_LOBBY') {
                          const opps = summary?.opponentNames && summary.opponentNames.length > 0 ? ` avec ${summary.opponentNames.slice(0, 2).join(', ')}` : '';
                          badgeText = `🔵 En salon${opps} (${currentRoomCode ? `#${currentRoomCode}` : 'Privé'})`;
                          badgeStyle = 'bg-slate-500/15 text-slate-300 border-slate-500/30';
                          dotStyle = 'bg-slate-400';
                        } else if (status === 'IN_GAME') {
                          const opps = summary?.opponentNames && summary.opponentNames.length > 0
                            ? ` contre ${summary.opponentNames.slice(0, 2).join(', ')}${summary.opponentNames.length > 2 ? ' +' + (summary.opponentNames.length - 2) : ''}`
                            : '';
                          badgeText = `🟣 En jeu${opps} (${currentRoomCode ? `#${currentRoomCode}` : 'En cours'})`;
                          badgeStyle = 'bg-slate-500/15 text-slate-300 border-slate-500/30 font-extrabold';
                          dotStyle = 'bg-slate-400';
                        }

                        const canJoinRoom = (status === 'IN_LOBBY' || status === 'IN_GAME') && Boolean(currentRoomCode);
                        const canReplaceBot = status === 'IN_GAME' && Boolean(summary?.hasReplaceableBot);
                        const isTableFull = summary ? summary.humanPlayersCount >= summary.maxPlayers && !canReplaceBot : false;

                        return (
                          <div
                            key={`${friendId}_${idx}`}
                            className="p-3.5 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className="relative shrink-0">
                                <PlayerAvatar
                                  avatarId={friendAvatar as any}
                                  size="sm"
                                  className="w-9 h-9"
                                />
                                <span
                                  className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-slate-900 ${dotStyle}`}
                                />
                              </div>

                              <div className="flex flex-col min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-xs font-black text-white truncate">{friendName}</span>
                                  {friendCode && (
                                    <span className="text-xs text-amber-400 font-mono font-bold">
                                      {friendCode}
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                  <span className={`text-xs font-bold px-1.5 py-0.5 rounded-md border ${badgeStyle}`}>
                                    {badgeText}
                                  </span>
                                  {summary && (
                                    <span className="text-xs text-slate-400 font-medium">
                                      ({summary.humanPlayersCount}/{summary.maxPlayers} joueurs)
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Context-aware Action Buttons */}
                            <div className="flex items-center gap-1.5 shrink-0 justify-end flex-wrap sm:flex-nowrap">
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedH2HOpponent({
                                    id: friendId,
                                    name: friendName,
                                    avatarId: friendAvatar,
                                    avatarSeed: friendAvatar,
                                    friendCode,
                                  });
                                  triggerHaptic('light');
                                }}
                                className="h-8 px-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/30 text-xs font-bold flex items-center gap-1 shadow-sm transition active:scale-95 cursor-pointer"
                                title="Voir les statistiques du Face-à-face direct (Victoires, Kora, Fortune)"
                              >
                                <Swords className="w-3.5 h-3.5 text-amber-400" />
                                <span>Face-à-face</span>
                              </button>

                              {status === 'ONLINE_IDLE' && (
                                <button
                                  type="button"
                                  onClick={() => handleChallengeFriend({ id: friendId, name: friendName, avatarSeed: friendAvatar }, 'ONLINE_IDLE')}
                                  className="h-8 px-3 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 text-slate-950 text-xs font-black flex items-center gap-1 shadow-sm transition active:scale-95 cursor-pointer"
                                >
                                  <Swords className="w-3.5 h-3.5" />
                                  <span>Défier</span>
                                </button>
                              )}

                              {status === 'IN_SOLO' && (
                                <button
                                  type="button"
                                  onClick={() => handleChallengeFriend({ id: friendId, name: friendName, avatarSeed: friendAvatar }, 'IN_SOLO')}
                                  className="h-8 px-3 rounded-xl bg-gradient-to-r from-amber-500 to-amber-500 hover:from-amber-400 text-slate-950 text-xs font-black flex items-center gap-1 shadow-sm transition active:scale-95 cursor-pointer"
                                  title="Inviter directement : sa partie solo sera sauvegardée s'il accepte."
                                >
                                  <Swords className="w-3.5 h-3.5" />
                                  <span>Défier</span>
                                </button>
                              )}

                              {canJoinRoom && !isTableFull && (
                                <button
                                  type="button"
                                  onClick={() => handleJoin(currentRoomCode!)}
                                  className={`h-8 px-3 rounded-xl text-xs font-black flex items-center gap-1 shadow-sm transition active:scale-95 cursor-pointer ${
                                    canReplaceBot
                                      ? 'bg-gradient-to-r from-emerald-400 to-emerald-500 hover:from-emerald-300 text-slate-950'
                                      : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950'
                                  }`}
                                >
                                  {canReplaceBot ? (
                                    <>
                                      <UserPlus className="w-3.5 h-3.5" />
                                      <span>Remplacer un bot</span>
                                    </>
                                  ) : (
                                    <>
                                      <UserPlus className="w-3.5 h-3.5" />
                                      <span>Rejoindre la table</span>
                                    </>
                                  )}
                                </button>
                              )}

                              {canJoinRoom && isTableFull && (
                                <button
                                  type="button"
                                  onClick={() => handleChallengeFriend({ id: friendId, name: friendName, avatarSeed: friendAvatar }, 'IN_GAME')}
                                  className="h-8 px-2.5 rounded-xl bg-slate-600 hover:bg-slate-500 text-white text-xs font-bold flex items-center gap-1 shadow-sm transition active:scale-95 cursor-pointer"
                                  title="Table complète : envoyer une invitation pour la partie suivante"
                                >
                                  <Mail className="w-3.5 h-3.5" />
                                  <span>Défier ensuite</span>
                                </button>
                              )}

                              {status === 'OFFLINE' && (
                                <button
                                  type="button"
                                  onClick={() => handleWhatsAppInviteFriend({ id: friendId, name: friendName, avatarSeed: friendAvatar })}
                                  className="h-8 px-3 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 text-xs font-bold flex items-center gap-1.5 transition active:scale-95 cursor-pointer"
                                  title="Inviter via WhatsApp pour qu'il se connecte"
                                >
                                  <MessageCircle className="w-3.5 h-3.5 text-emerald-400" />
                                  <span>Inviter (WhatsApp)</span>
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={() => handleRemoveFriend(friendId, friendName)}
                                title="Retirer de la liste d'amis"
                                className="w-8 h-8 rounded-xl bg-slate-800 hover:bg-rose-500/20 hover:text-rose-300 text-slate-400 flex items-center justify-center transition cursor-pointer shrink-0"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}

              {/* VIEW 2 : DEMANDES REÇUES */}
              {friendSubTab === 'RECEIVED' && (
                <div className="flex flex-col gap-2">
                  {pendingReceivedRequests.length === 0 ? (
                    <div className="py-10 px-6 rounded-3xl bg-slate-900/40 border border-slate-800/80 flex flex-col items-center justify-center text-center gap-3">
                      <div className="w-14 h-14 rounded-full bg-slate-800 flex items-center justify-center">
                        <Inbox className="w-7 h-7 text-slate-400" />
                      </div>
                      <div className="flex flex-col gap-1">
                        <h3 className="text-sm font-bold text-slate-200">Aucune demande reçue</h3>
                        <p className="text-xs text-slate-400 max-w-[240px]">
                          Lorsque d'autres joueurs t'ajoutent par ton code ami, leurs invitations apparaîtront ici.
                        </p>
                      </div>
                    </div>
                  ) : (
                    pendingReceivedRequests.map((req, idx) => {
                      const isActing = friendActionPendingMap[req.friendUid];
                      return (
                        <div
                          key={`${req.friendUid}_${idx}`}
                          className="p-3.5 rounded-2xl bg-gradient-to-r from-amber-500/10 via-slate-900 to-slate-900 border border-amber-500/30 flex items-center justify-between gap-3 shadow-md"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <PlayerAvatar
                              avatarId={(req.avatarId as any) || 'avatar_1'}
                              size="sm"
                              className="w-10 h-10 border border-amber-400/40"
                            />
                            <div className="flex flex-col min-w-0">
                              <span className="text-xs font-black text-white truncate">{req.displayName}</span>
                              <span className="text-xs text-amber-400 font-mono font-bold">{req.friendCode}</span>
                              <span className="text-xs text-slate-400">Souhaite devenir ton ami</span>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              disabled={isActing}
                              onClick={() => handleAcceptFriendRequest(req)}
                              className="h-8 px-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs flex items-center gap-1 shadow-md shadow-emerald-500/20 transition active:scale-95 disabled:opacity-50 cursor-pointer"
                            >
                              <Check className="w-3.5 h-3.5 stroke-[3]" />
                              <span>Accepter</span>
                            </button>
                            <button
                              type="button"
                              disabled={isActing}
                              onClick={() => handleDeclineFriendRequest(req)}
                              className="h-8 px-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs flex items-center gap-1 transition active:scale-95 disabled:opacity-50 cursor-pointer"
                            >
                              <X className="w-3.5 h-3.5" />
                              <span>Refuser</span>
                            </button>
                            <button
                              type="button"
                              disabled={isActing}
                              onClick={() => handleBlockPlayer(req.friendUid, req.displayName, req.friendCode)}
                              className="h-8 px-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 font-bold text-xs flex items-center gap-1 transition active:scale-95 disabled:opacity-50 cursor-pointer"
                              title="Bloquer ce joueur"
                            >
                              <UserX className="w-3.5 h-3.5" />
                              <span>Bloquer</span>
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}

              {/* VIEW 3 : DEMANDES ENVOYÉES */}
              {friendSubTab === 'SENT' && (
                <div className="flex flex-col gap-2">
                  {pendingSentRequests.length === 0 ? (
                    <div className="py-10 px-6 rounded-3xl bg-slate-900/40 border border-slate-800/80 flex flex-col items-center justify-center text-center gap-3">
                      <div className="w-14 h-14 rounded-full bg-slate-800 flex items-center justify-center">
                        <Send className="w-7 h-7 text-slate-400" />
                      </div>
                      <div className="flex flex-col gap-1">
                        <h3 className="text-sm font-bold text-slate-200">Aucune demande en attente</h3>
                        <p className="text-xs text-slate-400 max-w-[240px]">
                          Toutes les demandes que tu as envoyées ont été traitées.
                        </p>
                      </div>
                    </div>
                  ) : (
                    pendingSentRequests.map((req, idx) => {
                      const isActing = friendActionPendingMap[req.friendUid];
                      return (
                        <div
                          key={`${req.friendUid}_${idx}`}
                          className="p-3.5 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-between gap-3"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <PlayerAvatar
                              avatarId={(req.avatarId as any) || 'avatar_1'}
                              size="sm"
                              className="w-9 h-9 opacity-80"
                            />
                            <div className="flex flex-col min-w-0">
                              <span className="text-xs font-bold text-slate-200 truncate">{req.displayName}</span>
                              <span className="text-xs text-amber-400 font-mono">{req.friendCode}</span>
                              <span className="text-xs text-slate-400 flex items-center gap-1">
                                <Clock className="w-3 h-3 text-amber-400" /> En attente de confirmation
                              </span>
                            </div>
                          </div>

                          <button
                            type="button"
                            disabled={isActing}
                            onClick={() => handleCancelSentRequest(req)}
                            className="h-8 px-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white text-xs font-medium flex items-center gap-1 transition cursor-pointer"
                          >
                            <span>Annuler</span>
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              )}

              {/* Recent Opponents */}
              {recentPlayers.length > 0 && (
                <div className="flex flex-col gap-2 mt-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black uppercase tracking-wider text-slate-400">
                      Joueurs récents ({recentPlayers.length})
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        FriendService.clearRecentPlayers();
                        setRecentPlayers([]);
                        triggerHaptic('light');
                      }}
                      className="text-xs font-bold text-slate-400 hover:text-rose-400 flex items-center gap-1 transition cursor-pointer"
                      title="Effacer l'historique des adversaires récents"
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>Vider</span>
                    </button>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {recentPlayers.map((r, idx) => {
                      const isMe = r.id === localPlayerId || (Boolean(profile?.uid) && r.id === profile?.uid);
                      const isFriend = acceptedFriends.some((f: any) => (f.friendUid || f.id) === r.id);
                      const isPendingSent = pendingSentRequests.some((f) => f.friendUid === r.id);
                      const isPendingReceived = pendingReceivedRequests.some((f) => f.friendUid === r.id);
                      const isActing = Boolean(friendActionPendingMap[r.id]);

                      return (
                        <div
                          key={`${r.id}_${idx}`}
                          className="p-2.5 rounded-xl bg-slate-900/70 border border-slate-800/80 flex items-center justify-between gap-2"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <PlayerAvatar
                              avatarId={(r.avatarSeed as any) || 'avatar_1'}
                              size="sm"
                              className="w-7 h-7 shrink-0"
                            />
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="text-xs font-bold text-slate-200 truncate">{r.name}</span>
                              {isMe && (
                                <span className="text-xs font-black px-1 rounded bg-amber-400 text-slate-950 uppercase">
                                  Moi
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            {!isMe && (
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedH2HOpponent({
                                    id: r.id,
                                    name: r.name,
                                    avatarSeed: r.avatarSeed,
                                    avatarId: r.avatarSeed,
                                  });
                                  triggerHaptic('light');
                                }}
                                className="h-6 px-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/20 text-xs font-bold flex items-center gap-1 transition active:scale-95 cursor-pointer"
                                title="Voir les statistiques du Face-à-face direct"
                              >
                                <Swords className="w-2.5 h-2.5 text-amber-400" />
                                <span>Face-à-face</span>
                              </button>
                            )}

                            {isMe ? null : isFriend ? (
                              <span
                                className="h-6 px-2 rounded-lg bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-xs font-bold flex items-center gap-1 select-none"
                                title="Ce joueur fait partie de tes amis"
                              >
                                <Check className="w-2.5 h-2.5 text-emerald-400" />
                                <span>Ami</span>
                              </span>
                            ) : isPendingSent ? (
                              <span
                                className="h-6 px-2 rounded-lg bg-amber-500/15 text-amber-300 border border-amber-500/30 text-xs font-bold flex items-center gap-1 select-none"
                                title="Demande d'ami envoyée, en attente"
                              >
                                <Clock className="w-2.5 h-2.5 text-amber-400 animate-pulse" />
                                <span>En attente</span>
                              </span>
                            ) : isPendingReceived ? (
                              <button
                                type="button"
                                disabled={isActing}
                                onClick={async () => {
                                  if (profile?.uid) {
                                    setFriendActionPendingMap((prev) => ({ ...prev, [r.id]: true }));
                                    try {
                                      await FriendService.acceptCloudFriendRequest(profile.uid, r.id, r.name, (r as any).avatarSeed || (r as any).avatarId);
                                      setHubSuccessMsg(`Demande acceptée ! ${r.name} est maintenant ton ami.`);
                                      triggerHaptic('success');
                                      setTimeout(() => setHubSuccessMsg(null), getPublicParamNumber('uiToastLongDurationMs'));
                                    } catch (e: any) {
                                      setHubErrorMsg(e?.message || 'La demande n\'a pas pu être acceptée. Réessaie.');
                                    } finally {
                                      setFriendActionPendingMap((prev) => ({ ...prev, [r.id]: false }));
                                    }
                                  }
                                }}
                                className="h-6 px-2 rounded-lg bg-gradient-to-r from-emerald-500 to-emerald-600 text-slate-950 text-xs font-bold hover:brightness-110 transition cursor-pointer"
                                title="Accepter la demande d'ami"
                              >
                                {isActing ? '...' : 'Accepter'}
                              </button>
                            ) : (
                              <button
                                type="button"
                                disabled={isActing}
                                onClick={async () => {
                                  if (isLoggedIn && profile?.uid) {
                                    await handleSendFriendRequest({
                                      uid: r.id,
                                      displayName: r.name,
                                      avatarId: r.avatarSeed,
                                    });
                                  } else {
                                    FriendService.addLocalContact({
                                      id: r.id,
                                      name: r.name,
                                      avatarSeed: r.avatarSeed,
                                    });
                                    setLocalContacts(FriendService.getLocalContacts());
                                    triggerHaptic('success');
                                  }
                                }}
                                className="h-6 px-2 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/40 text-xs font-bold hover:bg-amber-500 hover:text-slate-950 transition cursor-pointer flex items-center gap-1"
                                title="Ajouter en ami"
                              >
                                <UserPlus className="w-2.5 h-2.5" />
                                <span>{isActing ? '...' : '+ Ami'}</span>
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

      {/* ========================================================================= */}
      {/* MODAL 4 : AJOUTER UN AMI PAR CODE OU PSEUDO                              */}
      {/* ========================================================================= */}
      <AnimatePresence>
        {showAddFriendModal && (
          <div className="fixed inset-0 z-[70] bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-4 sm:p-5 shadow-2xl flex flex-col gap-4 max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
                    <UserPlus className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-white">Ajouter un ami</h3>
                    <p className="text-xs text-slate-400">Recherche un joueur par pseudo ou code ami</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowAddFriendModal(false);
                    setFriendSearchResults([]);
                  }}
                  className="w-8 h-8 rounded-full bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center cursor-pointer transition"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {!isLoggedIn && (
                <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-2.5">
                  <ShieldCheck className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                  <div className="flex flex-col gap-1.5 flex-1">
                    <span className="text-xs font-bold text-amber-300">Connexion Google recommandée</span>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      Connecte ton compte Google pour envoyer une demande et retrouver tes amis sur tous tes appareils.
                    </p>
                    <button
                      type="button"
                      onClick={handleGoogleSignIn}
                      className="self-start h-7 px-3 rounded-lg bg-white hover:bg-slate-100 text-slate-950 text-xs font-bold flex items-center gap-1.5 shadow-sm transition active:scale-95 cursor-pointer"
                    >
                      <GoogleIcon className="w-3.5 h-3.5" />
                      <span>Sauvegarder avec Google</span>
                    </button>
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-2">
                <label className="text-xs text-slate-300 font-bold flex items-center justify-between">
                  <span>Rechercher un joueur</span>
                  <span className="text-xs text-amber-400 font-mono">
                    Mon code : {FriendService.getFriendCode(localPlayerId, profile?.friendCode)}
                  </span>
                </label>
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    maxLength={30}
                    value={newFriendInput}
                    onChange={(e) => handleSearchFriend(e.target.value)}
                    placeholder="Ex: #NK-X7B2Q9 ou Pseudo..."
                    className="w-full h-11 pl-10 pr-10 rounded-xl bg-slate-950 border border-slate-700 text-white text-sm font-medium focus:outline-none focus:border-amber-400 transition"
                  />
                  {isSearchingFriends && (
                    <RefreshCw className="w-4 h-4 text-amber-400 animate-spin absolute right-3.5 top-1/2 -translate-y-1/2" />
                  )}
                  {newFriendInput && !isSearchingFriends && (
                    <button
                      type="button"
                      onClick={() => {
                        setNewFriendInput('');
                        setFriendSearchResults([]);
                      }}
                      className="w-5 h-5 rounded-full bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer text-xs"
                    >
                      ×
                    </button>
                  )}
                </div>
              </div>

              {/* SEARCH RESULTS */}
              {newFriendInput.trim().length > 0 && (
                <div className="flex flex-col gap-2">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                    Résultats de recherche ({friendSearchResults.length})
                  </span>

                  {friendSearchResults.length === 0 && !isSearchingFriends ? (
                    <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800/80 text-center flex flex-col items-center gap-2">
                      <p className="text-xs text-slate-400">
                        {newFriendInput.trim().toUpperCase().includes('NK-')
                          ? 'Ce code est introuvable (aucun compte associé).'
                          : 'Aucun joueur enregistré avec ce pseudo ou code.'}
                      </p>
                      <button
                        type="button"
                        onClick={handleAddFriendLegacyFallback}
                        className="text-xs font-bold text-slate-400 hover:text-amber-400 underline cursor-pointer mt-1"
                      >
                        + Ajouter ce pseudo sur cet appareil seulement
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-1.5 max-h-56 overflow-y-auto pr-1">
                      {friendSearchResults.map((player, idx) => {
                        const isSelf = player.uid === profile?.uid || player.uid === localPlayerId;
                        const isAlreadyFriend = acceptedFriends.some(
                          (f: any) => (f.friendUid || f.id) === player.uid
                        );
                        const isPendingSent = pendingSentRequests.some((f) => f.friendUid === player.uid);
                        const isPendingReceived = pendingReceivedRequests.find(
                          (f) => f.friendUid === player.uid
                        );
                        const isActing = friendActionPendingMap[player.uid];

                        return (
                          <div
                            key={`${player.uid}_${idx}`}
                            className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-2.5"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <PlayerAvatar
                                avatarId={(player.avatarId as any) || 'avatar_1'}
                                size="sm"
                                className="w-8 h-8"
                              />
                              <div className="flex flex-col min-w-0">
                                <span className="text-xs font-bold text-white truncate">
                                  {player.displayName} {isSelf && '(Toi)'}
                                </span>
                                <span className="text-xs text-amber-400 font-mono">
                                  {player.friendCode}
                                </span>
                              </div>
                            </div>

                            {/* DYNAMIC ACTION BUTTON */}
                            <div className="shrink-0 flex items-center gap-1.5">
                              {isSelf ? (
                                <span className="text-xs text-slate-500 font-bold px-2 py-1 rounded-lg bg-slate-800">
                                  Toi
                                </span>
                              ) : isAlreadyFriend ? (
                                <span className="text-xs text-emerald-400 font-bold px-2 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center gap-1">
                                  <Check className="w-3 h-3" /> Ami
                                </span>
                              ) : isPendingSent ? (
                                <span className="text-xs text-amber-300 font-bold px-2 py-1 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center gap-1">
                                  <Clock className="w-3 h-3" /> Envoyée
                                </span>
                              ) : isPendingReceived ? (
                                <button
                                  type="button"
                                  disabled={isActing}
                                  onClick={() => handleAcceptFriendRequest(isPendingReceived)}
                                  className="h-7 px-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold flex items-center gap-1 shadow-sm transition active:scale-95 cursor-pointer disabled:opacity-50"
                                >
                                  <Check className="w-3 h-3" />
                                  <span>Accepter</span>
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  disabled={isActing}
                                  onClick={() => handleSendFriendRequest(player)}
                                  className="h-7 px-3 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black flex items-center gap-1 shadow-sm transition active:scale-95 cursor-pointer disabled:opacity-50"
                                >
                                  <UserPlus className="w-3.5 h-3.5" />
                                  <span>Demander</span>
                                </button>
                              )}

                              {!isSelf && (
                                <button
                                  type="button"
                                  disabled={isActing}
                                  onClick={() => handleBlockPlayer(player.uid, player.displayName, player.friendCode)}
                                  className="h-7 px-2 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 text-xs font-bold flex items-center gap-1 transition active:scale-95 cursor-pointer disabled:opacity-50"
                                  title="Bloquer ce joueur"
                                >
                                  <UserX className="w-3.5 h-3.5" />
                                  <span>Bloquer</span>
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              <div className="flex justify-end gap-2 mt-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddFriendModal(false);
                    setFriendSearchResults([]);
                  }}
                  className="h-9 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold cursor-pointer transition"
                >
                  Fermer
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ========================================================================= */}
      {/* MODAL 5 : MON CODE AMI & QR CODE                                          */}
      {/* ========================================================================= */}
      <FriendQrModal
        isOpen={showQrModal}
        onClose={() => setShowQrModal(false)}
        playerId={localPlayerId}
        playerName={playerName}
        activeRoomCode={room?.id}
        cashInvite={room?.cash ? { bet: room.baseBet, rakePercent: room.cash.rakePercent } : null}
        storedFriendCode={profile?.friendCode}
      />

      {/* ========================================================================= */}
      {/* MODAL 6 : FACE-À-FACE & STATISTIQUES DIRECTES (RIVALITÉS)                 */}
      {/* ========================================================================= */}
      <HeadToHeadModal
        isOpen={Boolean(selectedH2HOpponent)}
        onClose={() => setSelectedH2HOpponent(null)}
        opponent={selectedH2HOpponent}
        onChallenge={(opp) => {
          handleChallengeFriend(opp, 'ONLINE_IDLE');
        }}
      />
    </>
  );
};
