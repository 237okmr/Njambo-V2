import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Plus,
  Trash2,
  CheckCircle2,
  Clock,
  AlertCircle,
  Sparkles,
  Search,
  Filter,
  Bug,
  MessageSquare,
  Lightbulb,
  Milestone,
  CheckSquare,
  Copy,
  Check,
  ChevronDown,
  RefreshCw,
  ExternalLink,
  BookOpen,
} from 'lucide-react';
import {
  AdminNote,
  AdminNotePriority,
  AdminNoteStatus,
  AdminNoteType,
  CreateAdminNoteInput,
} from '../../types/adminNotes';
import { AdminNotesService } from '../../services/adminNotesService';

interface KatikaAdminNotesPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onInsertInChat?: (text: string) => void;
}

const TYPE_CONFIG: Record<
  AdminNoteType,
  { label: string; icon: React.FC<{ className?: string }>; color: string; badgeBg: string }
> = {
  BUG: {
    label: 'Bug',
    icon: Bug,
    color: 'text-rose-400 border-rose-500/40 bg-rose-500/10',
    badgeBg: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
  },
  FEEDBACK: {
    label: 'Retour Testeur',
    icon: MessageSquare,
    color: 'text-amber-400 border-amber-500/40 bg-amber-500/10',
    badgeBg: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
  },
  IDEE: {
    label: 'Idée',
    icon: Lightbulb,
    color: 'text-yellow-400 border-yellow-500/40 bg-yellow-500/10',
    badgeBg: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40',
  },
  ROADMAP: {
    label: 'Roadmap',
    icon: Milestone,
    color: 'text-purple-400 border-purple-500/40 bg-purple-500/10',
    badgeBg: 'bg-purple-500/20 text-purple-300 border-purple-500/40',
  },
  TACHE: {
    label: 'Tâche',
    icon: CheckSquare,
    color: 'text-sky-400 border-sky-500/40 bg-sky-500/10',
    badgeBg: 'bg-sky-500/20 text-sky-300 border-sky-500/40',
  },
};

const PRIORITY_CONFIG: Record<
  AdminNotePriority,
  { label: string; badgeBg: string; textClass: string }
> = {
  P1: { label: 'P1 (Urgent)', badgeBg: 'bg-red-500/20 text-red-300 border-red-500/50', textClass: 'text-red-400 font-bold' },
  P2: { label: 'P2 (Normal)', badgeBg: 'bg-amber-500/20 text-amber-300 border-amber-500/40', textClass: 'text-amber-400 font-medium' },
  P3: { label: 'P3 (Faible)', badgeBg: 'bg-slate-700/50 text-slate-300 border-slate-600', textClass: 'text-slate-400' },
};

const STATUS_CONFIG: Record<
  AdminNoteStatus,
  { label: string; badgeBg: string; icon: React.FC<{ className?: string }> }
> = {
  OUVERT: { label: 'Ouvert', badgeBg: 'bg-blue-500/20 text-blue-300 border-blue-500/40', icon: AlertCircle },
  EN_COURS: { label: 'En cours', badgeBg: 'bg-amber-500/20 text-amber-300 border-amber-500/40', icon: Clock },
  FAIT: { label: 'Fait', badgeBg: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40', icon: CheckCircle2 },
};

export const KatikaAdminNotesPanel: React.FC<KatikaAdminNotesPanelProps> = ({
  isOpen,
  onClose,
  onInsertInChat,
}) => {
  const [notes, setNotes] = useState<AdminNote[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [typeFilter, setTypeFilter] = useState<'ALL' | AdminNoteType>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | AdminNoteStatus>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // New Note form state
  const [newType, setNewType] = useState<AdminNoteType>('FEEDBACK');
  const [newTitle, setNewTitle] = useState('');
  const [newDetails, setNewDetails] = useState('');
  const [newPriority, setNewPriority] = useState<AdminNotePriority>('P2');
  const [newStatus, setNewStatus] = useState<AdminNoteStatus>('OUVERT');
  const [newSource, setNewSource] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    setIsLoading(true);
    const unsubscribe = AdminNotesService.subscribeNotes((loadedNotes) => {
      setNotes(loadedNotes);
      setIsLoading(false);
    }, 100);

    return () => {
      unsubscribe();
    };
  }, [isOpen]);

  const handleCreateNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    setIsSubmitting(true);
    try {
      const input: CreateAdminNoteInput = {
        type: newType,
        title: newTitle.trim().slice(0, 120),
        details: newDetails.trim() ? newDetails.trim().slice(0, 600) : undefined,
        priority: newPriority,
        status: newStatus,
        source: newSource.trim() ? newSource.trim().slice(0, 120) : undefined,
      };
      await AdminNotesService.createNote(input);
      setNewTitle('');
      setNewDetails('');
      setNewSource('');
      setNewPriority('P2');
      setNewStatus('OUVERT');
      setShowAddForm(false);
    } catch (err) {
      console.error('Erreur création note:', err);
      alert('Erreur lors de la création de la note. Vérifiez les permissions Firestore.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStatusChange = async (note: AdminNote, nextStatus: AdminNoteStatus) => {
    try {
      await AdminNotesService.updateNote(note.id, { status: nextStatus });
    } catch (err) {
      console.error('Erreur changement de statut:', err);
    }
  };

  const handlePriorityChange = async (note: AdminNote, nextPriority: AdminNotePriority) => {
    try {
      await AdminNotesService.updateNote(note.id, { priority: nextPriority });
    } catch (err) {
      console.error('Erreur changement de priorité:', err);
    }
  };

  const handleDeleteNote = async (id: string) => {
    if (!window.confirm('Supprimer définitivement cette note ?')) return;
    try {
      await AdminNotesService.deleteNote(id);
    } catch (err) {
      console.error('Erreur suppression note:', err);
    }
  };

  const handleCopyRef = (id: string) => {
    const refText = `#note_${id}`;
    navigator.clipboard.writeText(refText);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const filteredNotes = useMemo(() => {
    return notes.filter((n) => {
      if (typeFilter !== 'ALL' && n.type !== typeFilter) return false;
      if (statusFilter !== 'ALL' && n.status !== statusFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTitle = n.title.toLowerCase().includes(q);
        const matchDetails = (n.details || '').toLowerCase().includes(q);
        const matchSource = (n.source || '').toLowerCase().includes(q);
        const matchId = n.id.toLowerCase().includes(q);
        if (!matchTitle && !matchDetails && !matchSource && !matchId) return false;
      }
      return true;
    });
  }, [notes, typeFilter, statusFilter, searchQuery]);

  const openCount = useMemo(() => {
    return notes.filter((n) => n.status !== 'FAIT').length;
  }, [notes]);

  if (!isOpen) return null;

  return (
    <div
      id="katika-admin-notes-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200"
    >
      <div className="relative w-full max-w-4xl max-h-[92vh] bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden text-slate-100">
        {/* Header */}
        <div className="shrink-0 px-5 py-4 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold text-white tracking-tight">
                  Carnet de Bord & Roadmap
                </h2>
                <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  {openCount} ouverte{openCount > 1 ? 's' : ''}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Suivi du développement, retours testeurs et tâches administratives (accessible au Copilote Katika en lecture seule)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition cursor-pointer"
            aria-label="Fermer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Action and Filter Bar */}
        <div className="shrink-0 p-4 bg-slate-900/60 border-b border-slate-800/80 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            {/* Search Input */}
            <div className="relative flex-1 min-w-[200px] max-w-md">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Rechercher une note, un bug, un testeur..."
                className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl bg-slate-950/80 border border-slate-800 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500/60 transition"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-200"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Toggle Add Note Form Button */}
            <button
              type="button"
              onClick={() => setShowAddForm(!showAddForm)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
                showAddForm
                  ? 'bg-slate-800 text-slate-300 border border-slate-700'
                  : 'bg-gradient-to-r from-amber-500 to-amber-400 text-slate-950 font-bold hover:from-amber-400 hover:to-amber-300 shadow-sm'
              }`}
            >
              {showAddForm ? (
                <>
                  <X className="w-3.5 h-3.5" />
                  <span>Annuler</span>
                </>
              ) : (
                <>
                  <Plus className="w-3.5 h-3.5" />
                  <span>Nouvelle note</span>
                </>
              )}
            </button>
          </div>

          {/* Filters pills */}
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            {/* Type Filters */}
            <div className="flex items-center gap-1 bg-slate-950/60 p-1 rounded-xl border border-slate-800/80 text-[11px]">
              <button
                type="button"
                onClick={() => setTypeFilter('ALL')}
                className={`px-2 py-0.5 rounded-lg font-medium transition cursor-pointer ${
                  typeFilter === 'ALL'
                    ? 'bg-amber-500 text-slate-950 font-bold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Tous ({notes.length})
              </button>
              {(['BUG', 'FEEDBACK', 'IDEE', 'ROADMAP', 'TACHE'] as AdminNoteType[]).map((t) => {
                const count = notes.filter((n) => n.type === t).length;
                const cfg = TYPE_CONFIG[t];
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTypeFilter(t)}
                    className={`px-2 py-0.5 rounded-lg font-medium transition cursor-pointer flex items-center gap-1 ${
                      typeFilter === t
                        ? 'bg-slate-800 text-white font-semibold'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <span>{cfg.label}</span>
                    <span className="text-[9px] opacity-70">({count})</span>
                  </button>
                );
              })}
            </div>

            {/* Status Filters */}
            <div className="flex items-center gap-1 bg-slate-950/60 p-1 rounded-xl border border-slate-800/80 text-[11px] ml-auto">
              <button
                type="button"
                onClick={() => setStatusFilter('ALL')}
                className={`px-2 py-0.5 rounded-lg font-medium transition cursor-pointer ${
                  statusFilter === 'ALL'
                    ? 'bg-slate-800 text-white font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Tous états
              </button>
              {(['OUVERT', 'EN_COURS', 'FAIT'] as AdminNoteStatus[]).map((st) => {
                const count = notes.filter((n) => n.status === st).length;
                const cfg = STATUS_CONFIG[st];
                return (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setStatusFilter(st)}
                    className={`px-2 py-0.5 rounded-lg font-medium transition cursor-pointer flex items-center gap-1 ${
                      statusFilter === st
                        ? 'bg-slate-800 text-white font-semibold'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <span>{cfg.label}</span>
                    <span className="text-[9px] opacity-70">({count})</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Add Note Form (Collapsible) */}
        {showAddForm && (
          <form
            onSubmit={handleCreateNote}
            className="shrink-0 p-4 bg-slate-950/80 border-b border-slate-800 space-y-3 animate-in fade-in duration-150"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                <Plus className="w-3.5 h-3.5" />
                Ajouter une entrée au carnet
              </h3>
              <span className="text-[10px] text-slate-400">Plafond : 100 notes max</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {/* Type selector */}
              <div>
                <label className="block text-[11px] font-medium text-slate-300 mb-1">Type</label>
                <select
                  value={newType}
                  onChange={(e) => setNewType(e.target.value as AdminNoteType)}
                  className="w-full px-2.5 py-1.5 text-xs rounded-xl bg-slate-900 border border-slate-800 text-slate-200 focus:outline-none focus:border-amber-500/60"
                >
                  <option value="BUG">🐛 Bug</option>
                  <option value="FEEDBACK">💬 Retour Testeur</option>
                  <option value="IDEE">💡 Idée</option>
                  <option value="ROADMAP">🗺️ Roadmap</option>
                  <option value="TACHE">📋 Tâche</option>
                </select>
              </div>

              {/* Priority selector */}
              <div>
                <label className="block text-[11px] font-medium text-slate-300 mb-1">Priorité</label>
                <select
                  value={newPriority}
                  onChange={(e) => setNewPriority(e.target.value as AdminNotePriority)}
                  className="w-full px-2.5 py-1.5 text-xs rounded-xl bg-slate-900 border border-slate-800 text-slate-200 focus:outline-none focus:border-amber-500/60"
                >
                  <option value="P1">🔴 P1 (Urgent)</option>
                  <option value="P2">🟠 P2 (Normal)</option>
                  <option value="P3">⚪ P3 (Faible)</option>
                </select>
              </div>

              {/* Source (optional) */}
              <div>
                <label className="block text-[11px] font-medium text-slate-300 mb-1">
                  Source <span className="text-slate-500">(Testeur, WhatsApp...)</span>
                </label>
                <input
                  type="text"
                  maxLength={120}
                  value={newSource}
                  onChange={(e) => setNewSource(e.target.value)}
                  placeholder="Ex: Christian (WhatsApp), Session #4..."
                  className="w-full px-2.5 py-1.5 text-xs rounded-xl bg-slate-900 border border-slate-800 text-slate-200 focus:outline-none focus:border-amber-500/60 placeholder-slate-600"
                />
              </div>
            </div>

            {/* Title */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] font-medium text-slate-300">
                  Titre / Objet <span className="text-rose-400">*</span>
                </label>
                <span className="text-[10px] text-slate-500">{newTitle.length}/120</span>
              </div>
              <input
                type="text"
                required
                maxLength={120}
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Ex: Le timer ne décompte plus si la fenêtre passe en arrière-plan"
                className="w-full px-3 py-1.5 text-xs rounded-xl bg-slate-900 border border-slate-800 text-slate-200 focus:outline-none focus:border-amber-500/60 placeholder-slate-600"
              />
            </div>

            {/* Details */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] font-medium text-slate-300">
                  Détails & reproduction <span className="text-slate-500">(Optionnel)</span>
                </label>
                <span className="text-[10px] text-slate-500">{newDetails.length}/600</span>
              </div>
              <textarea
                rows={2}
                maxLength={600}
                value={newDetails}
                onChange={(e) => setNewDetails(e.target.value)}
                placeholder="Ex: Testé sur Chrome Android. Le joueur subit un forfait non mérité."
                className="w-full px-3 py-1.5 text-xs rounded-xl bg-slate-900 border border-slate-800 text-slate-200 focus:outline-none focus:border-amber-500/60 placeholder-slate-600 resize-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="px-3 py-1.5 text-xs rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition cursor-pointer"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={isSubmitting || !newTitle.trim()}
                className="px-4 py-1.5 text-xs font-bold rounded-xl bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-slate-950 transition cursor-pointer disabled:opacity-50"
              >
                {isSubmitting ? 'Enregistrement...' : 'Enregistrer la note'}
              </button>
            </div>
          </form>
        )}

        {/* Notes List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2.5 divide-y divide-slate-800/40">
          {isLoading ? (
            <div className="py-12 flex flex-col items-center justify-center text-slate-400 gap-2">
              <RefreshCw className="w-6 h-6 animate-spin text-amber-400" />
              <p className="text-xs">Chargement des notes du carnet...</p>
            </div>
          ) : filteredNotes.length === 0 ? (
            <div className="py-12 text-center text-slate-400 space-y-2">
              <div className="w-12 h-12 rounded-2xl bg-slate-800/60 mx-auto flex items-center justify-center text-slate-500">
                <BookOpen className="w-6 h-6" />
              </div>
              <p className="text-sm font-medium text-slate-300">Aucune note trouvée</p>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                {searchQuery || typeFilter !== 'ALL' || statusFilter !== 'ALL'
                  ? 'Essayez de réinitialiser vos filtres de recherche.'
                  : 'Le carnet est vide. Cliquez sur « Nouvelle note » pour ajouter un retour testeur, un bug ou un point de roadmap.'}
              </p>
            </div>
          ) : (
            filteredNotes.map((note) => {
              const typeCfg = TYPE_CONFIG[note.type] || TYPE_CONFIG.TACHE;
              const prioCfg = PRIORITY_CONFIG[note.priority] || PRIORITY_CONFIG.P2;
              const statusCfg = STATUS_CONFIG[note.status] || STATUS_CONFIG.OUVERT;
              const TypeIcon = typeCfg.icon;
              const StatusIcon = statusCfg.icon;
              const isCopied = copiedId === note.id;

              return (
                <div
                  key={note.id}
                  className="pt-2.5 first:pt-0 group hover:bg-slate-800/20 p-2.5 rounded-xl transition border border-transparent hover:border-slate-800"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2.5 min-w-0 flex-1">
                      {/* Type Icon badge */}
                      <div
                        className={`w-7 h-7 shrink-0 rounded-lg flex items-center justify-center border mt-0.5 ${typeCfg.color}`}
                        title={typeCfg.label}
                      >
                        <TypeIcon className="w-3.5 h-3.5" />
                      </div>

                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {/* Note ID ref */}
                          <button
                            type="button"
                            onClick={() => handleCopyRef(note.id)}
                            title="Copier la référence #note_..."
                            className="font-mono text-[10px] text-slate-400 hover:text-amber-300 bg-slate-950/70 px-1.5 py-0.5 rounded border border-slate-800 flex items-center gap-1 transition cursor-pointer"
                          >
                            <span>#{note.id}</span>
                            {isCopied ? (
                              <Check className="w-2.5 h-2.5 text-emerald-400" />
                            ) : (
                              <Copy className="w-2.5 h-2.5 opacity-60" />
                            )}
                          </button>

                          {/* Type badge */}
                          <span
                            className={`px-1.5 py-0.2 text-[10px] font-semibold rounded border ${typeCfg.badgeBg}`}
                          >
                            {typeCfg.label}
                          </span>

                          {/* Priority dropdown / badge */}
                          <div className="relative inline-flex items-center">
                            <select
                              value={note.priority}
                              onChange={(e) =>
                                handlePriorityChange(note, e.target.value as AdminNotePriority)
                              }
                              className={`text-[10px] font-bold px-1.5 py-0.2 rounded border bg-slate-900 cursor-pointer focus:outline-none ${prioCfg.badgeBg}`}
                            >
                              <option value="P1">P1 (Urgent)</option>
                              <option value="P2">P2 (Normal)</option>
                              <option value="P3">P3 (Faible)</option>
                            </select>
                          </div>

                          {/* Status dropdown / badge */}
                          <div className="relative inline-flex items-center">
                            <select
                              value={note.status}
                              onChange={(e) =>
                                handleStatusChange(note, e.target.value as AdminNoteStatus)
                              }
                              className={`text-[10px] font-bold px-1.5 py-0.2 rounded border bg-slate-900 cursor-pointer focus:outline-none ${statusCfg.badgeBg}`}
                            >
                              <option value="OUVERT">🔵 Ouvert</option>
                              <option value="EN_COURS">🟠 En cours</option>
                              <option value="FAIT">🟢 Fait</option>
                            </select>
                          </div>

                          {/* Source tag if any */}
                          {note.source && (
                            <span className="text-[10px] text-slate-400 bg-slate-950/40 px-1.5 py-0.2 rounded border border-slate-800/80 truncate max-w-[140px]">
                              Source : {note.source}
                            </span>
                          )}
                        </div>

                        {/* Title */}
                        <h4
                          className={`text-xs font-semibold text-slate-100 leading-snug break-words ${
                            note.status === 'FAIT' ? 'line-through text-slate-400' : ''
                          }`}
                        >
                          {note.title}
                        </h4>

                        {/* Details */}
                        {note.details && (
                          <p className="text-[11px] text-slate-400 leading-relaxed break-words whitespace-pre-wrap">
                            {note.details}
                          </p>
                        )}

                        <div className="flex items-center gap-3 pt-0.5 text-[10px] text-slate-500">
                          <span>
                            Créé le {new Date(note.createdAt).toLocaleDateString('fr-FR')} à{' '}
                            {new Date(note.createdAt).toLocaleTimeString('fr-FR', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition">
                      {onInsertInChat && (
                        <button
                          type="button"
                          onClick={() =>
                            onInsertInChat(
                              `Peux-tu analyser la note #${note.id} (${note.type} : "${note.title}") et me proposer une solution ?`
                            )
                          }
                          title="Demander conseil au Copilote Katika sur cette note"
                          className="w-7 h-7 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 flex items-center justify-center transition cursor-pointer"
                        >
                          <Sparkles className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleDeleteNote(note.id)}
                        title="Supprimer cette note"
                        className="w-7 h-7 rounded-lg bg-slate-800/60 hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 flex items-center justify-center transition cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer info */}
        <div className="shrink-0 px-4 py-2.5 bg-slate-900/90 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-400">
          <div className="flex items-center gap-2">
            <span>
              Affichage de <strong className="text-white">{filteredNotes.length}</strong> /{' '}
              {notes.length} notes
            </span>
          </div>
          <span className="text-[10px] text-slate-500">
            Note : Copilote Katika a accès aux 15 notes ouvertes les plus prioritaires.
          </span>
        </div>
      </div>
    </div>
  );
};
