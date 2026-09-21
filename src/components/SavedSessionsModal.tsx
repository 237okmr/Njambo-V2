import React, { useState } from 'react';
import { SavedManche } from '../types';
import { FolderOpen, Save, Trash2, Play, Plus, Clock, Coins, Users, Edit3, Check, X, BookmarkCheck } from 'lucide-react';
import { motion } from 'motion/react';

interface SavedSessionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  savedSessions: SavedManche[];
  activeSessionId: string | null;
  onLoadSession: (sessionId: string) => void;
  onSaveCurrentSession: (customTitle?: string) => void;
  onDeleteSession: (sessionId: string) => void;
  onRenameSession: (sessionId: string, newTitle: string) => void;
  onNewManche: () => void;
}

export const SavedSessionsModal: React.FC<SavedSessionsModalProps> = ({
  isOpen,
  onClose,
  savedSessions = [],
  activeSessionId,
  onLoadSession,
  onSaveCurrentSession,
  onDeleteSession,
  onRenameSession,
  onNewManche,
}) => {
  const safeSessions = Array.isArray(savedSessions) ? savedSessions : [];
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState<string>('');
  const [customSaveTitle, setCustomSaveTitle] = useState<string>('');
  const [showSaveInput, setShowSaveInput] = useState<boolean>(false);

  if (!isOpen) return null;

  const handleStartRename = (session: SavedManche) => {
    setEditingId(session.id);
    setEditTitle(session.title);
  };

  const handleConfirmRename = (sessionId: string) => {
    if (editTitle.trim()) {
      onRenameSession(sessionId, editTitle.trim());
    }
    setEditingId(null);
  };

  const handleManualSave = () => {
    onSaveCurrentSession(customSaveTitle.trim() || undefined);
    setCustomSaveTitle('');
    setShowSaveInput(false);
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div
      id="saved-sessions-modal-backdrop"
      className="fixed inset-0 z-[60] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="w-full max-w-lg bg-slate-900 border border-amber-500/40 rounded-2xl p-4 sm:p-5 shadow-2xl text-slate-100 flex flex-col gap-4 my-auto max-h-[90vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3 gap-2">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center justify-center shadow shrink-0">
              <FolderOpen className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-base sm:text-xl font-black text-amber-300 leading-tight truncate">
                Gestion des Manches
              </h2>
              <p className="text-xs text-slate-400 line-clamp-1 sm:line-clamp-none">
                Sauvegardez vos parties, chargez ou basculez entre vos manches.
              </p>
            </div>
          </div>
          <button
            id="btn-close-saved-sessions"
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Quick Actions Bar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          {!showSaveInput ? (
            <button
              id="btn-save-current-session"
              type="button"
              onClick={() => setShowSaveInput(true)}
              className="flex-1 py-2 px-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs transition flex items-center justify-center gap-1.5 shadow"
            >
              <Save className="w-4 h-4" />
              <span>Sauvegarder la Manche actuelle</span>
            </button>
          ) : (
            <div className="flex-1 flex items-center gap-1.5 bg-slate-950 p-1.5 rounded-xl border border-amber-500/50">
              <input
                type="text"
                value={customSaveTitle}
                onChange={(e) => setCustomSaveTitle(e.target.value)}
                placeholder="Nom de la sauvegarde..."
                className="flex-1 bg-transparent px-2 text-xs font-semibold text-amber-200 focus:outline-none"
                autoFocus
                onKeyDown={(e) => e.key === 'Enter' && handleManualSave()}
              />
              <button
                type="button"
                onClick={handleManualSave}
                className="p-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-lg font-bold text-xs"
              >
                <Check className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setShowSaveInput(false)}
                className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          <button
            id="btn-create-new-manche"
            type="button"
            onClick={() => {
              onNewManche();
              onClose();
            }}
            className="py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-bold text-xs transition flex items-center justify-center gap-1.5"
          >
            <Plus className="w-4 h-4 text-emerald-400" />
            <span>Nouvelle Manche</span>
          </button>
        </div>

        {/* Sessions List */}
        <div className="flex-1 overflow-y-auto space-y-2.5 pr-1 max-h-[50vh]">
          {safeSessions.length === 0 ? (
            <div className="py-8 text-center bg-slate-950/40 rounded-xl border border-dashed border-slate-800 flex flex-col items-center justify-center gap-2">
              <FolderOpen className="w-8 h-8 text-slate-600" />
              <p className="text-xs text-slate-400 font-medium">
                Aucune Manche enregistrée pour le moment.
              </p>
              <p className="text-[11px] text-slate-500">
                La Manche en cours est sauvegardée automatiquement au fil du jeu.
              </p>
            </div>
          ) : (
            safeSessions.map((session) => {
              const isActive = session.id === activeSessionId;
              const isEditing = editingId === session.id;

              const players = session.gameState?.players || [];
              const humanPlayer = players.find((p) => p.isHuman) || players[0];
              const activePlayersCount = players.filter((p) => !p.isEliminated).length;

              return (
                <div
                  key={session.id}
                  className={`p-3 rounded-xl border transition-all flex flex-col gap-2 ${
                    isActive
                      ? 'bg-amber-950/30 border-amber-500/60 ring-1 ring-amber-500/30'
                      : 'bg-slate-950/70 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  {/* Top line: Title & Active Badge */}
                  <div className="flex items-center justify-between gap-2">
                    {isEditing ? (
                      <div className="flex items-center gap-1 flex-1">
                        <input
                          type="text"
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          className="flex-1 bg-slate-900 px-2 py-1 text-xs rounded border border-amber-500 font-bold text-amber-200 focus:outline-none"
                          autoFocus
                          onKeyDown={(e) => e.key === 'Enter' && handleConfirmRename(session.id)}
                        />
                        <button
                          type="button"
                          onClick={() => handleConfirmRename(session.id)}
                          className="p-1 bg-amber-500 text-slate-950 rounded"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 truncate min-w-0 flex-1">
                        <span className="font-extrabold text-sm text-slate-100 truncate">
                          {session.title}
                        </span>
                        {isActive && (
                          <span className="text-[10px] font-black bg-amber-500/20 text-amber-300 border border-amber-500/40 px-1.5 py-0.2 rounded shrink-0 flex items-center gap-0.5">
                            <BookmarkCheck className="w-3 h-3 text-amber-400" />
                            <span>En cours</span>
                          </span>
                        )}
                      </div>
                    )}

                    {/* Actions icons */}
                    {!isEditing && (
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          title="Renommer cette Manche"
                          onClick={() => handleStartRename(session)}
                          className="p-1 text-slate-400 hover:text-amber-300 rounded hover:bg-slate-800 transition"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          title="Supprimer cette Manche"
                          onClick={() => onDeleteSession(session.id)}
                          className="p-1 text-slate-400 hover:text-rose-400 rounded hover:bg-slate-800 transition"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Details pills */}
                  <div className="flex items-center justify-between gap-1 text-[10px] text-slate-300 bg-slate-900/60 px-2 py-1.5 rounded-lg border border-slate-800/80 flex-wrap">
                    <div className="flex items-center gap-1 text-slate-400">
                      <Clock className="w-3 h-3 text-amber-400/80 shrink-0" />
                      <span>{formatDate(session.updatedAt)}</span>
                    </div>

                    <div className="flex items-center gap-1 text-slate-300">
                      <Users className="w-3 h-3 text-blue-400 shrink-0" />
                      <span>{activePlayersCount}/{players.length}J</span>
                    </div>

                    <div className="flex items-center gap-1 text-amber-300 font-bold">
                      <Coins className="w-3 h-3 text-amber-400 shrink-0" />
                      <span>{humanPlayer ? humanPlayer.capital : 0} pts</span>
                    </div>

                    <div className="text-slate-400 font-mono text-[9px]">
                      P{session.gameState.partieCount || 1} · {session.baseBet}pts
                    </div>
                  </div>

                  {/* Load button */}
                  {!isActive && (
                    <button
                      type="button"
                      onClick={() => {
                        onLoadSession(session.id);
                        onClose();
                      }}
                      className="w-full py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold text-xs transition flex items-center justify-center gap-1.5"
                    >
                      <Play className="w-3.5 h-3.5 fill-amber-300" />
                      <span>Reprendre cette Manche</span>
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer info */}
        <div className="text-[10px] text-slate-400 text-center border-t border-slate-800 pt-2.5">
          Toutes les sauvegardes sont conservées localement dans votre navigateur.
        </div>
      </motion.div>
    </div>
  );
};
