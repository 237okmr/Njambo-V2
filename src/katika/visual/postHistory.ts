import { classifyQuestion, QuestionType } from './hokutoBank';

/**
 * Mémoire des derniers types de question utilisés dans les posts (pronostic, vote, défi, tag).
 * Sert à demander à l'IA de varier : le même type ne doit pas revenir dans les 3 posts suivants.
 * Stockage local du navigateur de l'admin, uniquement des étiquettes de type (aucun texte, aucune donnée de joueur).
 */
const STORAGE_KEY = 'katika_post_question_types_v1';
const MAX_REMEMBERED_TYPES = 3;

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function defaultStorage(): KeyValueStorage | null {
  try {
    return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null;
  } catch {
    return null;
  }
}

const VALID_TYPES: QuestionType[] = ['PRONOSTIC', 'VOTE', 'DEFI', 'TAG'];

export function getRecentQuestionTypes(storage: KeyValueStorage | null = defaultStorage()): QuestionType[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((t): t is QuestionType => VALID_TYPES.includes(t)).slice(0, MAX_REMEMBERED_TYPES) : [];
  } catch {
    return [];
  }
}

export function recordQuestionType(type: QuestionType, storage: KeyValueStorage | null = defaultStorage()): void {
  if (!storage) return;
  try {
    const updated = [type, ...getRecentQuestionTypes(storage)].slice(0, MAX_REMEMBERED_TYPES);
    storage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch {
    // La mémoire est un confort : en cas d'échec (stockage plein ou bloqué), on continue sans elle.
  }
}

/** Enregistre le type de la question d'un post généré (sans effet si la question est vide). */
export function recordPostQuestion(question: string | undefined, storage: KeyValueStorage | null = defaultStorage()): void {
  if (!question || !question.trim()) return;
  recordQuestionType(classifyQuestion(question), storage);
}

const TYPE_LABELS: Record<QuestionType, string> = {
  PRONOSTIC: 'pronostic',
  VOTE: 'vote A ou B',
  DEFI: 'défi',
  TAG: 'tag un pote',
};

/** Phrase courte ajoutée au brief (environ 20 tokens) ; vide quand rien n'est à éviter. */
export function buildQuestionHint(types: QuestionType[]): string {
  if (types.length === 0) return '';
  const labels = Array.from(new Set(types)).map((t) => TYPE_LABELS[t]);
  return `\n\nÉvite ces types de question déjà utilisés récemment : ${labels.join(', ')}.`;
}

export function withQuestionHint(brief: string, storage: KeyValueStorage | null = defaultStorage()): string {
  return `${brief}${buildQuestionHint(getRecentQuestionTypes(storage))}`;
}
