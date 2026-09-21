import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  limit,
  onSnapshot,
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
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

export const ADMIN_NOTES_COLLECTION = 'katika_admin_notes';

function generateNoteId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let rand = '';
  for (let i = 0; i < 6; i++) {
    rand += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `n_${Date.now().toString(36)}_${rand}`;
}

export class AdminNotesService {
  /**
   * Récupère la liste des notes d'administration ordonnées par date de création décroissante.
   */
  static async getNotes(limitCount: number = 100): Promise<AdminNote[]> {
    try {
      const q = query(
        collection(db, ADMIN_NOTES_COLLECTION),
        orderBy('createdAt', 'desc'),
        limit(Math.min(limitCount, 100))
      );
      const snapshot = await getDocs(q);
      const notes: AdminNote[] = [];
      snapshot.forEach((d) => {
        const data = d.data() as Partial<AdminNote>;
        notes.push({
          id: d.id,
          type: (data.type || 'TACHE') as AdminNoteType,
          title: String(data.title || '').slice(0, 120),
          details: data.details ? String(data.details).slice(0, 600) : undefined,
          priority: (data.priority || 'P2') as AdminNotePriority,
          status: (data.status || 'OUVERT') as AdminNoteStatus,
          source: data.source ? String(data.source).slice(0, 120) : undefined,
          createdAt: Number(data.createdAt) || Date.now(),
          updatedAt: Number(data.updatedAt) || Date.now(),
          createdBy: data.createdBy,
        });
      });
      return notes;
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
   * Crée une nouvelle note dans le carnet admin.
   */
  static async createNote(input: CreateAdminNoteInput): Promise<AdminNote> {
    const now = Date.now();
    const id = generateNoteId();
    const note: AdminNote = {
      id,
      type: input.type,
      title: input.title.trim().slice(0, 120),
      details: input.details ? input.details.trim().slice(0, 600) : undefined,
      priority: input.priority,
      status: input.status || 'OUVERT',
      source: input.source ? input.source.trim().slice(0, 120) : undefined,
      createdAt: now,
      updatedAt: now,
      createdBy: input.createdBy,
    };

    const docRef = doc(db, ADMIN_NOTES_COLLECTION, id);
    await setDoc(docRef, note);
    return note;
  }

  /**
   * Met à jour une note existante.
   */
  static async updateNote(id: string, input: UpdateAdminNoteInput): Promise<void> {
    const docRef = doc(db, ADMIN_NOTES_COLLECTION, id);
    const updates: Record<string, any> = {
      updatedAt: Date.now(),
    };

    if (input.type !== undefined) updates.type = input.type;
    if (input.title !== undefined) updates.title = input.title.trim().slice(0, 120);
    if (input.details !== undefined) updates.details = input.details ? input.details.trim().slice(0, 600) : '';
    if (input.priority !== undefined) updates.priority = input.priority;
    if (input.status !== undefined) updates.status = input.status;
    if (input.source !== undefined) updates.source = input.source ? input.source.trim().slice(0, 120) : '';

    await updateDoc(docRef, updates);
  }

  /**
   * Supprime une note.
   */
  static async deleteNote(id: string): Promise<void> {
    const docRef = doc(db, ADMIN_NOTES_COLLECTION, id);
    await deleteDoc(docRef);
  }

  /**
   * S'abonne aux changements en temps réel de la collection.
   */
  static subscribeNotes(
    callback: (notes: AdminNote[]) => void,
    limitCount: number = 100
  ): () => void {
    try {
      const q = query(
        collection(db, ADMIN_NOTES_COLLECTION),
        orderBy('createdAt', 'desc'),
        limit(Math.min(limitCount, 100))
      );
      return onSnapshot(
        q,
        (snapshot) => {
          const notes: AdminNote[] = [];
          snapshot.forEach((d) => {
            const data = d.data() as Partial<AdminNote>;
            notes.push({
              id: d.id,
              type: (data.type || 'TACHE') as AdminNoteType,
              title: String(data.title || '').slice(0, 120),
              details: data.details ? String(data.details).slice(0, 600) : undefined,
              priority: (data.priority || 'P2') as AdminNotePriority,
              status: (data.status || 'OUVERT') as AdminNoteStatus,
              source: data.source ? String(data.source).slice(0, 120) : undefined,
              createdAt: Number(data.createdAt) || Date.now(),
              updatedAt: Number(data.updatedAt) || Date.now(),
              createdBy: data.createdBy,
            });
          });
          callback(notes);
        },
        (err) => {
          console.warn('[AdminNotesService] Erreur subscription notes:', err);
        }
      );
    } catch (err) {
      console.warn('[AdminNotesService] Erreur initialisation snapshot:', err);
      return () => {};
    }
  }
}
