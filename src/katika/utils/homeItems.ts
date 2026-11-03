import type { KatikaTab } from '../types/katika';

/** Une ligne de « À traiter maintenant » : ce qui demande une action, avec l'onglet où la faire. */
export interface HomeTodoItem {
  level: 'CRITICAL' | 'WARNING' | 'OK';
  text: string;
  tab?: KatikaTab;
}

export interface HomeInputs {
  /** null : non lu ; false : serveur injoignable. */
  serverUp: boolean | null;
  maintenance: boolean;
  /** Retraits qui attendent la décision d'un admin ; null si non lu ou non permis. */
  withdrawalsAwaiting: number | null;
  /** Alertes de collusion ouvertes ; null si non lu ou non permis. */
  collusionAlerts: number | null;
  /** Alertes du journal des dernières 24 h ; null si non lu ou non permis. */
  journalAlerts: { critical: number; warning: number } | null;
}

const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;

export function buildHomeTodo(input: HomeInputs): HomeTodoItem[] {
  const items: HomeTodoItem[] = [];
  if (input.serverUp === false) items.push({ level: 'CRITICAL', text: 'Serveur du jeu injoignable' });
  if (input.maintenance) items.push({ level: 'WARNING', text: 'Mode maintenance actif : les tables sont fermées aux joueurs', tab: 'SETTINGS' });
  if (input.withdrawalsAwaiting && input.withdrawalsAwaiting > 0) {
    items.push({ level: 'WARNING', text: `${plural(input.withdrawalsAwaiting, 'retrait attend', 'retraits attendent')} ta décision`, tab: 'KORA_CASH' });
  }
  if (input.collusionAlerts && input.collusionAlerts > 0) {
    items.push({ level: 'CRITICAL', text: `${plural(input.collusionAlerts, 'alerte', 'alertes')} de collusion à examiner`, tab: 'KORA_CASH' });
  }
  if (input.journalAlerts && input.journalAlerts.critical > 0) {
    items.push({ level: 'CRITICAL', text: `${plural(input.journalAlerts.critical, 'alerte critique', 'alertes critiques')} au journal (24 h)`, tab: 'LOGS' });
  }
  if (input.journalAlerts && input.journalAlerts.warning > 0) {
    items.push({ level: 'WARNING', text: `${plural(input.journalAlerts.warning, 'avertissement', 'avertissements')} au journal (24 h)`, tab: 'LOGS' });
  }
  if (items.length === 0 && input.serverUp === true) items.push({ level: 'OK', text: 'Rien à traiter pour le moment' });
  return items.sort((a, b) => rank(a.level) - rank(b.level));
}

const rank = (level: HomeTodoItem['level']) => (level === 'CRITICAL' ? 0 : level === 'WARNING' ? 1 : 2);

/** Une action Kora Cash lancée depuis un téléphone demande une confirmation renforcée. */
export function needsStrongConfirm(method: string | undefined, url: string, compactScreen: boolean): boolean {
  if (!compactScreen) return false;
  const m = (method || 'GET').toUpperCase();
  return m !== 'GET' && url.startsWith('/api/katika/cash/');
}
