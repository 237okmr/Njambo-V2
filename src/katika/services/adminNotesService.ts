import { tikaFetch } from './tikaFetch';
import {
  AdminNote,
  AdminNotePriority,
  AdminNoteStatus,
  AdminNoteType,
  AdminNotesSnapshot,
  AdminNoteSnapshotItem,
  CreateAdminNoteInput,
  UpdateAdminNoteInput,
} from '../types/adminNotes';

/** Le carnet passe par le serveur : la collection est fermée aux navigateurs, et le serveur vérifie les droits de chaque admin. */
const NOTES_CHANGED_EVENT = 'katika-notes-changed';

function normalizeNote(data: Partial<AdminNote> & { id: string }): AdminNote {
  return {
    id: data.id,
    type: (data.type || 'TACHE') as AdminNoteType,
    title: String(data.title || '').slice(0, 120),
    details: data.details ? String(data.details).slice(0, 600) : undefined,
    priority: (data.priority || 'P2') as AdminNotePriority,
    status: (data.status || 'OUVERT') as AdminNoteStatus,
    source: data.source ? String(data.source).slice(0, 120) : undefined,
    createdAt: Number(data.createdAt) || Date.now(),
    updatedAt: Number(data.updatedAt) || Date.now(),
    createdBy: data.createdBy,
  };
}

async function notesRequest(url: string, init?: RequestInit): Promise<any> {
  const res = await tikaFetch(url, init);
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.success) throw new Error(body?.error || 'Carnet indisponible.');
  return body;
}

function announceChange(): void {
  window.dispatchEvent(new Event(NOTES_CHANGED_EVENT));
}

export class AdminNotesService {
  /**
   * Récupère la liste des notes d'administration ordonnées par date de création décroissante.
   */
  static async getNotes(limitCount: number = 100): Promise<AdminNote[]> {
    try {
      const body = await notesRequest('/api/katika/notes');
      return (Array.isArray(body.notes) ? body.notes : []).slice(0, limitCount).map(normalizeNote);
    } catch (err) {
      console.warn('[AdminNotesService] Erreur chargement des notes:', err);
      return [];
    }
  }

  /**
   * Construit la synthèse pour le snapshot télémétrique de l'assistant IA.
   * - openCount : nombre de notes ouvertes (status !== 'FAIT')
   * - countsByType : répartition par type
   * - items : max 15 notes ouvertes triées par priorité (P1 > P2 > P3) puis récence
   */
  static async getNotesSnapshotData(): Promise<AdminNotesSnapshot> {
    const allNotes = await this.getNotes(100);

    const countsByType: Record<AdminNoteType, number> = {
      BUG: 0,
      FEEDBACK: 0,
      IDEE: 0,
      ROADMAP: 0,
      TACHE: 0,
    };

    let openCount = 0;
    const openNotes: AdminNote[] = [];

    for (const note of allNotes) {
      if (countsByType[note.type] !== undefined) {
        countsByType[note.type] += 1;
      }
      if (note.status !== 'FAIT') {
        openCount++;
        openNotes.push(note);
      }
    }

    const priorityWeight: Record<AdminNotePriority, number> = {
      P1: 3,
      P2: 2,
      P3: 1,
    };

    openNotes.sort((a, b) => {
      const pDiff = (priorityWeight[b.priority] ?? 2) - (priorityWeight[a.priority] ?? 2);
      if (pDiff !== 0) return pDiff;
      return b.createdAt - a.createdAt;
    });

    const items: AdminNoteSnapshotItem[] = openNotes.slice(0, 15).map((n) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      priority: n.priority,
      status: n.status,
      source: n.source,
    }));

    return {
      openCount,
      countsByType,
      items,
    };
  }

  /**
   * Crée une nouvelle note dans le carnet admin (l'auteur est fixé par le serveur).
   */
  static async createNote(input: CreateAdminNoteInput): Promise<AdminNote> {
    const body = await notesRequest('/api/katika/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    announceChange();
    return normalizeNote(body.note);
  }

  /**
   * Met à jour une note existante.
   */
  static async updateNote(id: string, input: UpdateAdminNoteInput): Promise<void> {
    await notesRequest(`/api/katika/notes/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    announceChange();
  }

  /**
   * Supprime une note.
   */
  static async deleteNote(id: string): Promise<void> {
    await notesRequest(`/api/katika/notes/${encodeURIComponent(id)}`, { method: 'DELETE' });
    announceChange();
  }

  /**
   * Charge les notes, puis les recharge après chaque modification faite depuis cet écran (plus d'écoute continue de la base).
   */
  static subscribeNotes(callback: (notes: AdminNote[]) => void, limitCount: number = 100): () => void {
    let active = true;
    const load = () => {
      void this.getNotes(limitCount).then((notes) => {
        if (active) callback(notes);
      });
    };
    load();
    window.addEventListener(NOTES_CHANGED_EVENT, load);
    return () => {
      active = false;
      window.removeEventListener(NOTES_CHANGED_EVENT, load);
    };
  }
}
