import { tikaFetch } from './tikaFetch';
import { KatikaAuditLog } from '../types/katika';

/** Fiche d'un administrateur ajouté, telle que la renvoie le serveur (server/katika/adminRegistry.ts). */
export interface AdminEntry {
  uid: string;
  email: string;
  status: 'ACTIVE' | 'REVOKED';
  template?: string;
  permissions: string[];
  grantedAt?: string;
  grantedBy?: string;
  updatedAt?: string;
  revokedAt?: string;
}

export interface AdminTemplate {
  label: string;
  permissions: string[];
}

export interface AdminsData {
  admins: AdminEntry[];
  templates: Record<string, AdminTemplate>;
  permissionLabels: Record<string, string>;
}

async function request(url: string, init?: RequestInit): Promise<any> {
  const res = await tikaFetch(url, init);
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.success) throw new Error(body?.error || 'Action impossible pour le moment.');
  return body;
}

const json = (method: string, payload: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload),
});

export const AdminsService = {
  async load(): Promise<AdminsData> {
    const body = await request('/api/katika/admins');
    return {
      admins: Array.isArray(body.admins) ? body.admins : [],
      templates: body.templates || {},
      permissionLabels: body.permissionLabels || {},
    };
  },

  async invite(email: string, template: string, permissions: string[]): Promise<AdminEntry> {
    return (await request('/api/katika/admins', json('POST', { email, template, permissions }))).admin;
  },

  async updateRights(uid: string, template: string, permissions: string[]): Promise<AdminEntry> {
    return (await request(`/api/katika/admins/${encodeURIComponent(uid)}`, json('PUT', { template, permissions }))).admin;
  },

  async revoke(uid: string): Promise<void> {
    await request(`/api/katika/admins/${encodeURIComponent(uid)}`, { method: 'DELETE' });
  },

  /** Changements d'accès inscrits au journal d'audit (ajouts, modifications, retraits). */
  async history(limit = 10): Promise<KatikaAuditLog[]> {
    const body = await request('/api/katika/audit-logs').catch(() => null);
    const logs: KatikaAuditLog[] = Array.isArray(body?.logs) ? body.logs : [];
    return logs.filter((l) => /^adm_(grant|rights|revoke)_/.test(l.id)).slice(0, limit);
  },
};

export { matchTemplate } from '../utils/katikaAccess';
