import React, { useState, useEffect, useMemo } from 'react';
import { 
  Dices, 
  Search, 
  RotateCw, 
  Users, 
  ShieldAlert, 
  UserX, 
  RefreshCw, 
  Trash2, 
  CheckCircle2, 
  Clock, 
  AlertCircle,
  Eye,
  X,
  MoreHorizontal,
  Sparkles
} from 'lucide-react';
import { KatikaLiveRoom } from '../../types/katika';
import { KatikaService } from '../../services/katikaService';
import { KatikaLiveSpectatorModal } from '../modals/KatikaLiveSpectatorModal';
import { KATIKA_NAVIGATE_EVENT, KatikaNavigationEventDetail, navigateToKatikaTab } from '../../utils/katikaNavigation';

export const KatikaRoomsTab: React.FC = () => {
  const [rooms, setRooms] = useState<KatikaLiveRoom[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'IN_GAME' | 'WAITING' | 'FINISHED'>('ALL');

  useEffect(() => {
    const handleNav = (e: Event) => {
      const customEvent = e as CustomEvent<KatikaNavigationEventDetail>;
      if (customEvent.detail?.tab === 'ROOMS' && customEvent.detail.query !== undefined) {
        setSearchQuery(customEvent.detail.query);
        setStatusFilter('ALL');
      }
    };
    window.addEventListener(KATIKA_NAVIGATE_EVENT, handleNav);
    return () => window.removeEventListener(KATIKA_NAVIGATE_EVENT, handleNav);
  }, []);
  
  // Selected room for detailed modal/drawer
  const [selectedRoom, setSelectedRoom] = useState<KatikaLiveRoom | null>(null);
  
  // Action feedback
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Track open dropdown for table row actions
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);

  // Custom Modal Confirmation State
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    description: string;
    confirmLabel: string;
    variant: 'danger' | 'warning';
    onConfirm: () => Promise<void>;
  } | null>(null);

  const fetchRooms = async (silent: boolean = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await KatikaService.getLiveRooms();
      setRooms(data);
      // Synchronize selectedRoom with fresh telemetry if modal is open
      setSelectedRoom((prev) => {
        if (!prev) return null;
        const fresh = data.find((r) => r.roomId === prev.roomId);
        return fresh || prev;
      });
    } catch (err) {
      console.error('Failed to load live rooms:', err);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    fetchRooms();
    // Auto-poll live rooms telemetry every 3 seconds for real-time spectator view
    const interval = setInterval(() => {
      fetchRooms(true);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  const filteredRooms = useMemo(() => {
    return rooms.filter((r) => {
      const matchesSearch = 
        r.roomId.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.roomName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.players.some(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()));
      
      const matchesStatus = statusFilter === 'ALL' || r.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [rooms, searchQuery, statusFilter]);

  const requestCloseRoom = (roomId: string) => {
    setConfirmModal({
      isOpen: true,
      title: 'Fermeture Administrative de Table',
      description: `Confirmez-vous la fermeture et la dissolution immédiate de la table ${roomId} ? Tous les joueurs seront déconnectés.`,
      confirmLabel: 'Dissoudre la table',
      variant: 'danger',
      onConfirm: async () => {
        await KatikaService.closeRoom(roomId, 'Fermeture par le Katika Master');
        setRooms(prev => prev.filter(r => r.roomId !== roomId));
        if (selectedRoom?.roomId === roomId) {
          setSelectedRoom(null);
        }
        setActionSuccess(`La table ${roomId} a été fermée et dissoute sur le serveur.`);
        setTimeout(() => setActionSuccess(null), 4000);
        setConfirmModal(null);
      },
    });
  };

  const requestKickPlayer = (roomId: string, playerId: string, playerName: string) => {
    setConfirmModal({
      isOpen: true,
      title: 'Expulsion Administrative',
      description: `Voulez-vous expulser immédiatement "${playerName}" de la table ${roomId} ? Sa session WebSocket sera révoquée.`,
      confirmLabel: 'Expulser le joueur',
      variant: 'danger',
      onConfirm: async () => {
        await KatikaService.kickPlayer(roomId, playerId, playerName);
        setRooms(prev => prev.map(room => {
          if (room.roomId === roomId) {
            const updatedPlayers = room.players.filter(p => p.id !== playerId);
            return {
              ...room,
              players: updatedPlayers,
              currentPlayersCount: updatedPlayers.length,
            };
          }
          return room;
        }));

        if (selectedRoom?.roomId === roomId) {
          setSelectedRoom(prev => prev ? {
            ...prev,
            players: prev.players.filter(p => p.id !== playerId),
            currentPlayersCount: Math.max(0, prev.players.length - 1)
          } : null);
        }

        setActionSuccess(`Joueur ${playerName} expulsé du salon ${roomId}.`);
        setTimeout(() => setActionSuccess(null), 4000);
        setConfirmModal(null);
      },
    });
  };

  const requestResetTable = (roomId: string) => {
    setConfirmModal({
      isOpen: true,
      title: 'Réinitialisation de la Table',
      description: `Voulez-vous réinitialiser la manche et redistribuer les cartes pour tous les joueurs de la table ${roomId} ?`,
      confirmLabel: 'Réinitialiser la manche',
      variant: 'warning',
      onConfirm: async () => {
        await KatikaService.resetRound(roomId);
        setRooms(prev => prev.map(room => {
          if (room.roomId === roomId) {
            return {
              ...room,
              currentRound: 1,
              status: 'WAITING',
              players: room.players.map(p => ({ ...p, score: 0 }))
            };
          }
          return room;
        }));

        setActionSuccess(`Table ${roomId} réinitialisée avec succès.`);
        setTimeout(() => setActionSuccess(null), 4000);
        setConfirmModal(null);
      },
    });
  };

  return (
    <div className="space-y-6">
      {/* Top Banner Alert */}
      {actionSuccess && (
        <div className="p-3.5 rounded-xl bg-emerald-950/70 border border-emerald-800 text-emerald-300 text-xs flex items-center justify-between shadow-lg">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{actionSuccess}</span>
          </div>
          <button onClick={() => setActionSuccess(null)} className="text-emerald-400 hover:text-emerald-200">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Filter & Search Bar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 p-4 rounded-xl bg-slate-900/90 border border-slate-800">
        <div className="flex items-center gap-2 flex-1 max-w-md bg-slate-850 px-3 py-2 rounded-lg border border-slate-700/60">
          <Search className="w-4 h-4 text-slate-400 shrink-0" />
          <input
            type="text"
            id="katika-search-rooms-input"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Rechercher par code, nom de table ou pseudo..."
            className="bg-transparent border-none outline-none text-xs text-white placeholder-slate-500 w-full"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="text-slate-400 hover:text-slate-200">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-3">
          {/* Status Filter Tabs */}
          <div className="flex items-center bg-slate-850 p-1 rounded-lg border border-slate-700/60 text-xs">
            {(['ALL', 'IN_GAME', 'WAITING'] as const).map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                  statusFilter === st
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {st === 'ALL' && 'Tous'}
                {st === 'IN_GAME' && 'En Partie'}
                {st === 'WAITING' && 'En Attente'}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => {
              const inGameRooms = rooms.filter(r => r.status === 'IN_GAME');
              const waitingRooms = rooms.filter(r => r.status === 'WAITING');
              const totalPlayers = rooms.reduce((acc, r) => acc + r.players.length, 0);
              navigateToKatikaTab('AI_ASSISTANT', {
                initialPrompt: `Analyse de la supervision des salons en direct :\n- Total salons ouverts: ${rooms.length} (${inGameRooms.length} en partie, ${waitingRooms.length} en attente)\n- Total joueurs assis: ${totalPlayers}\n- Salons actifs: ${inGameRooms.map(r => `${r.roomName} (${r.players.length}/${r.maxPlayers}j, Pot: ${r.pot || 0} jetons)`).join('; ') || 'Aucun salon en cours'}\n\nPeux-tu faire un diagnostic de l'activité en temps réel, de la saturation des tables et me signaler d'éventuels blocages ou lenteurs ?`
              });
            }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gradient-to-r from-purple-500/20 to-amber-500/20 hover:from-purple-500/30 hover:to-amber-500/30 text-amber-200 text-xs font-semibold border border-amber-500/40 shadow-sm cursor-pointer transition-all"
            title="Consulter l'Assistant IA sur l'état des tables en direct"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>Analyser avec l'IA</span>
          </button>

          <button
            type="button"
            onClick={() => fetchRooms()}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium border border-slate-700 cursor-pointer"
            title="Rafraîchir les salons"
          >
            <RotateCw className={`w-3.5 h-3.5 text-amber-400 ${loading ? 'animate-spin' : ''}`} />
            <span>Actualiser</span>
          </button>
        </div>
      </div>

      {/* CRM Rooms Table */}
      <div className="rounded-xl bg-slate-900/90 border border-slate-800 overflow-hidden shadow-lg">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-850/80 border-b border-slate-800 text-slate-400 font-mono uppercase text-[10px] tracking-wider">
                <th className="py-3 px-4">Code Table</th>
                <th className="py-3 px-4">Nom de la Table</th>
                <th className="py-3 px-4">Statut</th>
                <th className="py-3 px-4">Joueurs</th>
                <th className="py-3 px-4">Partie (5 Tours)</th>
                <th className="py-3 px-4">Créée</th>
                <th className="py-3 px-4 text-right">Actions Katika</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filteredRooms.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-500 font-mono">
                    Aucun salon actif ne correspond aux critères de recherche.
                  </td>
                </tr>
              ) : (
                filteredRooms.map((room) => {
                  const isFull = room.currentPlayersCount >= room.maxPlayers;
                  return (
                    <tr 
                      key={room.roomId}
                      className="hover:bg-slate-850/50 transition-colors"
                    >
                      <td className="py-3.5 px-4 font-mono font-bold text-amber-400">
                        {room.roomId}
                      </td>
                      <td className="py-3.5 px-4 font-medium text-slate-200">
                        {room.roomName}
                      </td>
                      <td className="py-3.5 px-4">
                        {room.status === 'IN_GAME' && (
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono text-[10px]">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            Manche en Cours
                          </span>
                        )}
                        {room.status === 'WAITING' && (
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/20 font-mono text-[10px]">
                            <Clock className="w-3 h-3 text-amber-400" />
                            En Attente
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <div className="flex flex-col">
                            <span className={`font-mono font-semibold ${isFull ? 'text-cyan-400' : 'text-slate-300'}`}>
                              {room.currentPlayersCount} / {room.maxPlayers}
                            </span>
                            <span className="text-[9px] text-slate-500 font-mono mt-0.5 whitespace-nowrap">
                              👤 {room.players.filter(p => p.isHuman).length} • 🤖 {room.players.filter(p => !p.isHuman).length}
                            </span>
                          </div>
                          <div className="flex -space-x-1.5">
                            {room.players.map((p, idx) => (
                              <div
                                key={p.id}
                                title={`${p.name} (${p.score} pts)`}
                                className={`w-5 h-5 rounded-full border border-slate-900 flex items-center justify-center text-[9px] font-bold text-white uppercase ${
                                  p.isHost ? 'bg-amber-600' : 'bg-slate-700'
                                }`}
                              >
                                {p.name.charAt(0)}
                              </div>
                            ))}
                          </div>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 font-mono text-slate-300">
                        {room.currentRound > 0 ? (
                          <div className="flex flex-col">
                            <span className="text-amber-300 font-semibold font-mono text-xs">
                              Partie {room.currentRound}
                            </span>
                            <span className="text-[10px] text-slate-500 font-mono">
                              Tour {room.currentTrickNumber || 1}/5
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-500">—</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-slate-500 font-mono text-[11px]">
                        {new Date(room.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="py-3.5 px-4 text-right relative">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setSelectedRoom(room)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-medium border border-slate-700 transition-colors cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5 text-amber-400" />
                            <span>Superviser</span>
                          </button>
                          
                          <div className="relative">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setOpenDropdownId(openDropdownId === room.roomId ? null : room.roomId);
                              }}
                              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 border border-slate-700 transition-colors cursor-pointer"
                              title="Actions administratives"
                            >
                              <MoreHorizontal className="w-3.5 h-3.5" />
                            </button>

                            {openDropdownId === room.roomId && (
                              <>
                                <div 
                                  className="fixed inset-0 z-10" 
                                  onClick={() => setOpenDropdownId(null)}
                                />
                                <div className="absolute right-0 mt-1.5 z-20 w-48 rounded-xl bg-slate-900 border border-slate-800 p-1.5 shadow-2xl text-left">
                                  <div className="px-2 py-1 text-[9px] font-mono uppercase tracking-wider text-slate-500 border-b border-slate-800/80 mb-1">
                                    Contrôle Table & IA
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setOpenDropdownId(null);
                                      navigateToKatikaTab('AI_ASSISTANT', {
                                        initialPrompt: `Analyse en direct de la table "${room.roomName}" (${room.roomId}) :\n- Statut: ${room.status}\n- Joueurs: ${room.players.map(p => `${p.name} (${p.id.startsWith('bot_') || p.name.toLowerCase().includes('bot') ? 'Bot' : 'Humain'}, score: ${p.score || 0})`).join(', ')}\n- Manche: ${room.currentRound}, Tour: ${room.currentTrickNumber || 1}/5\n- Pot: ${(room.pot || (room.baseBet || 100) * room.players.length).toLocaleString('fr-FR')} jetons\n\nDiagnostic de performance et détection d'anti-jeu sur cette table ?`
                                      });
                                    }}
                                    className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-amber-300 hover:bg-amber-500/15 text-xs text-left transition-colors cursor-pointer font-medium"
                                  >
                                    <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                                    <span>Audit IA de la table</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setOpenDropdownId(null);
                                      requestResetTable(room.roomId);
                                    }}
                                    className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-slate-300 hover:text-amber-300 hover:bg-amber-500/10 text-xs text-left transition-colors cursor-pointer"
                                  >
                                    <RefreshCw className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                                    <span>Réinitialiser la manche</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setOpenDropdownId(null);
                                      requestCloseRoom(room.roomId);
                                    }}
                                    className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-slate-300 hover:text-rose-400 hover:bg-rose-500/10 text-xs text-left transition-colors cursor-pointer"
                                  >
                                    <Trash2 className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                                    <span>Dissoudre la table</span>
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detailed Room Inspection & Live Spectator Modal */}
      {selectedRoom && (
        <KatikaLiveSpectatorModal
          room={selectedRoom}
          onClose={() => setSelectedRoom(null)}
          onRefresh={fetchRooms}
          onResetTable={requestResetTable}
          onCloseRoom={requestCloseRoom}
          onKickPlayer={requestKickPlayer}
        />
      )}

      {/* Confirmation Modal */}
      {confirmModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                confirmModal.variant === 'danger' 
                  ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' 
                  : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
              }`}>
                <AlertCircle className="w-5 h-5" />
              </div>
              <h4 className="text-base font-bold text-white">{confirmModal.title}</h4>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              {confirmModal.description}
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-800">
              <button
                onClick={() => setConfirmModal(null)}
                className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition"
              >
                Annuler
              </button>
              <button
                onClick={confirmModal.onConfirm}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition shadow-lg ${
                  confirmModal.variant === 'danger'
                    ? 'bg-rose-600 hover:bg-rose-500 text-white'
                    : 'bg-amber-500 hover:bg-amber-400 text-slate-950'
                }`}
              >
                {confirmModal.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
