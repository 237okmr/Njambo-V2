/**
 * Mémoire de la dernière table créée par l'hôte et de ses derniers coéquipiers.
 * Sert au bouton « Nouvelle table comme la dernière fois » en tête du hub multijoueur.
 * Tables gratuites uniquement : une table Kora Cash se crée depuis Kora Cash, chacun y choisit sa mise.
 */

export interface LastTableSettings {
  isPublic: boolean;
  fillWithBots: boolean;
  maxPlayers: number;
  baseBet: number;
  initialCapital: number;
  turnTimerSeconds: number;
  enableDoubleKora: boolean;
  enableUnder21: boolean;
}

export interface LastTeammate {
  id: string;
  name: string;
}

export interface LastTable {
  settings: LastTableSettings;
  teammates: LastTeammate[];
}

export const LAST_TABLE_STORAGE_KEY = 'njambo_last_table_v1';
const MAX_TEAMMATES = 6;

function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

export function parseLastTable(raw: string | null | undefined): LastTable | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    const s = data?.settings;
    if (!s || !isNum(s.maxPlayers) || !isNum(s.baseBet) || !isNum(s.initialCapital) || !isNum(s.turnTimerSeconds)) return null;
    const settings: LastTableSettings = {
      isPublic: s.isPublic !== false,
      fillWithBots: s.fillWithBots === true,
      maxPlayers: Math.min(4, Math.max(2, Math.round(s.maxPlayers))),
      baseBet: s.baseBet,
      initialCapital: s.initialCapital,
      turnTimerSeconds: s.turnTimerSeconds,
      enableDoubleKora: s.enableDoubleKora !== false,
      enableUnder21: s.enableUnder21 !== false,
    };
    const teammates: LastTeammate[] = Array.isArray(data.teammates)
      ? data.teammates
          .filter((t: any) => t && typeof t.id === 'string' && t.id && typeof t.name === 'string')
          .slice(0, MAX_TEAMMATES)
          .map((t: any) => ({ id: t.id, name: t.name.slice(0, 40) }))
      : [];
    return { settings, teammates };
  } catch {
    return null;
  }
}

export function serializeLastTable(table: LastTable): string {
  return JSON.stringify({
    settings: table.settings,
    teammates: table.teammates.slice(0, MAX_TEAMMATES),
  });
}

/** Joueurs humains de la table, hors moi-même, sans doublon, dans l'ordre d'arrivée. */
export function pickTeammates(
  players: Array<{ id: string; name: string; isHuman: boolean }>,
  localPlayerId: string
): LastTeammate[] {
  const seen = new Set<string>();
  const out: LastTeammate[] = [];
  for (const p of players) {
    if (!p.isHuman || p.id === localPlayerId || seen.has(p.id)) continue;
    seen.add(p.id);
    out.push({ id: p.id, name: p.name });
    if (out.length >= MAX_TEAMMATES) break;
  }
  return out;
}

/** Fusionne : les coéquipiers connus sont remplacés par ceux de la table courante si elle en a. */
export function mergeLastTable(
  previous: LastTable | null,
  settings: LastTableSettings,
  teammates: LastTeammate[] | null
): LastTable {
  return {
    settings,
    teammates: teammates && teammates.length > 0 ? teammates : previous?.teammates ?? [],
  };
}
