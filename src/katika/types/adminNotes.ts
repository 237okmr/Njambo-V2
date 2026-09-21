export type AdminNoteType = 'BUG' | 'FEEDBACK' | 'IDEE' | 'ROADMAP' | 'TACHE';
export type AdminNotePriority = 'P1' | 'P2' | 'P3';
export type AdminNoteStatus = 'OUVERT' | 'EN_COURS' | 'FAIT';

export interface AdminNote {
  id: string;
  type: AdminNoteType;
  title: string; // ≤ 120 caractères
  details?: string; // ≤ 600 caractères
  priority: AdminNotePriority;
  status: AdminNoteStatus;
  source?: string; // texte libre : nom du testeur, WhatsApp…
  createdAt: number;
  updatedAt: number;
  createdBy?: string;
}

export interface CreateAdminNoteInput {
  type: AdminNoteType;
  title: string;
  details?: string;
  priority: AdminNotePriority;
  status?: AdminNoteStatus;
  source?: string;
  createdBy?: string;
}

export interface UpdateAdminNoteInput {
  type?: AdminNoteType;
  title?: string;
  details?: string;
  priority?: AdminNotePriority;
  status?: AdminNoteStatus;
  source?: string;
}

export interface AdminNoteSnapshotItem {
  id: string;
  type: AdminNoteType;
  title: string;
  priority: AdminNotePriority;
  status: AdminNoteStatus;
  source?: string;
}

export interface AdminNotesSnapshot {
  openCount: number;
  countsByType: Record<AdminNoteType, number>;
  items: AdminNoteSnapshotItem[];
}
