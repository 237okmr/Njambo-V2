import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Check, Crown, History, Loader2, RotateCw, ShieldCheck, UserMinus, UserPlus, X } from 'lucide-react';
import { AdminEntry, AdminsData, AdminsService } from '../../services/adminsService';
import { matchTemplate } from '../../utils/katikaAccess';
import { KatikaAuditLog } from '../../types/katika';

/** Droits qui touchent l'argent ou les réglages du jeu : signalés à part. */
const SENSITIVE = new Set(['cash.manage', 'settings.edit', 'players.edit']);

const formatDate = (iso?: string) =>
  iso ? new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

interface RightsEditorProps {
  data: AdminsData;
  permissions: string[];
  onChange: (permissions: string[]) => void;
}

/** Choix d'un modèle puis réglage case par case. */
const RightsEditor: React.FC<RightsEditorProps> = ({ data, permissions, onChange }) => {
  const current = matchTemplate(data.templates, permissions);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Modèle de droits">
        {Object.entries(data.templates).map(([id, template]) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={current === id}
            onClick={() => onChange([...template.permissions])}
            className={`min-h-[44px] px-4 rounded-xl text-sm border transition-colors ${
              current === id
                ? 'bg-amber-500/20 border-amber-500/60 text-amber-200'
                : 'bg-slate-900 border-slate-700 text-slate-300 hover:border-slate-500'
            }`}
          >
            {template.label}
          </button>
        ))}
        {current === 'CUSTOM' && (
          <span className="min-h-[44px] px-4 rounded-xl text-sm border border-slate-600 text-slate-300 flex items-center">Personnalisé</span>
        )}
      </div>

      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1">
        {Object.entries(data.permissionLabels).map(([id, label]) => {
          const checked = permissions.includes(id);
          return (
            <li key={id}>
              <label className="min-h-[44px] flex items-center gap-3 px-3 rounded-lg hover:bg-slate-800/60 cursor-pointer text-sm text-slate-200">
                <input
                  type="checkbox"
                  className="w-5 h-5 accent-amber-500 shrink-0"
                  checked={checked}
                  onChange={() => onChange(checked ? permissions.filter((p) => p !== id) : [...permissions, id])}
                />
                <span className="flex-1">{label}</span>
                {SENSITIVE.has(id) && <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" aria-label="Droit sensible" />}
              </label>
            </li>
          );
        })}
        <li className="min-h-[44px] flex items-center gap-3 px-3 text-sm text-slate-500">
          <Crown className="w-5 h-5 shrink-0" />
          <span>Gérer les administrateurs et les clés de paiement : toi seul</span>
        </li>
      </ul>

      {permissions.some((p) => SENSITIVE.has(p)) && (
        <p className="text-xs text-amber-300 flex gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          Les droits marqués touchent à l'argent réel, aux réglages du jeu ou aux comptes des joueurs. Ne les donne qu'à une personne de confiance.
        </p>
      )}
    </div>
  );
};

const AdminCard: React.FC<{ admin: AdminEntry; data: AdminsData; onChanged: () => void }> = ({ admin, data, onChanged }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string[]>(admin.permissions);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const template = admin.template && data.templates[admin.template] ? data.templates[admin.template].label : 'Personnalisé';

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    try {
      await action();
      setEditing(false);
      setConfirmRevoke(false);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action impossible.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-white break-all">{admin.email}</div>
          <div className="text-xs text-slate-400">
            {template} · {admin.permissions.length} droit(s) · depuis le {formatDate(admin.grantedAt)}
          </div>
        </div>
        {!editing && !confirmRevoke && (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setDraft(admin.permissions);
                setEditing(true);
              }}
              className="min-h-[44px] px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-sm text-slate-200"
            >
              Modifier les droits
            </button>
            <button
              type="button"
              onClick={() => setConfirmRevoke(true)}
              className="min-h-[44px] px-4 rounded-xl bg-red-950/60 border border-red-800/60 hover:bg-red-900/60 text-sm text-red-200 flex items-center gap-2"
            >
              <UserMinus className="w-4 h-4" />
              Retirer l'accès
            </button>
          </div>
        )}
      </div>

      {editing && (
        <>
          <RightsEditor data={data} permissions={draft} onChange={setDraft} />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => run(() => AdminsService.updateRights(admin.uid, matchTemplate(data.templates, draft), draft))}
              className="min-h-[44px] px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-sm font-semibold flex items-center gap-2 disabled:opacity-50"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              Enregistrer
            </button>
            <button type="button" onClick={() => setEditing(false)} className="min-h-[44px] px-4 rounded-xl bg-slate-800 text-sm text-slate-300">
              Annuler
            </button>
          </div>
        </>
      )}

      {confirmRevoke && (
        <div className="rounded-xl border border-red-800/60 bg-red-950/40 p-3 flex flex-col gap-3">
          <p className="text-sm text-red-100">
            Retirer l'accès de {admin.email} ? Il perdra l'accès à katika en moins d'une minute. Tu pourras l'inviter à nouveau plus tard.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => run(() => AdminsService.revoke(admin.uid))}
              className="min-h-[44px] px-4 rounded-xl bg-red-600 hover:bg-red-500 text-white text-sm font-semibold flex items-center gap-2 disabled:opacity-50"
            >
              {busy && <Loader2 className="w-4 h-4 animate-spin" />}
              Oui, retirer l'accès
            </button>
            <button type="button" onClick={() => setConfirmRevoke(false)} className="min-h-[44px] px-4 rounded-xl bg-slate-800 text-sm text-slate-300">
              Annuler
            </button>
          </div>
        </div>
      )}

      {error && <p className="text-sm text-red-300" role="alert">{error}</p>}
    </li>
  );
};

/**
 * Écran Administrateurs : réservé au propriétaire. Les droits sont appliqués par le serveur (server/katika/adminRights.ts) ;
 * cet écran ne fait que les régler.
 */
export const KatikaAdminsPanel: React.FC = () => {
  const [data, setData] = useState<AdminsData | null>(null);
  const [history, setHistory] = useState<KatikaAuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [email, setEmail] = useState('');
  const [rights, setRights] = useState<string[]>([]);
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState('');
  const [inviteDone, setInviteDone] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [loaded, changes] = await Promise.all([AdminsService.load(), AdminsService.history()]);
      setData(loaded);
      setHistory(changes);
      setRights((current) => (current.length > 0 ? current : [...(loaded.templates.READ_ONLY?.permissions || [])]));
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Chargement impossible.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const invite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!data || !email.trim()) return;
    setInviting(true);
    setInviteError('');
    setInviteDone('');
    try {
      const added = await AdminsService.invite(email.trim(), matchTemplate(data.templates, rights), rights);
      setInviteDone(`${added.email} a maintenant accès à katika avec ${added.permissions.length} droit(s).`);
      setEmail('');
      await load();
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : 'Ajout impossible.');
    } finally {
      setInviting(false);
    }
  };

  const active = data?.admins.filter((a) => a.status === 'ACTIVE') ?? [];
  const revoked = data?.admins.filter((a) => a.status !== 'ACTIVE') ?? [];

  return (
    <div className="flex flex-col gap-6 text-slate-200">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <div>
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <Crown className="w-5 h-5 text-amber-400" />
            Administrateurs
          </h3>
          <p className="text-sm text-slate-400">
            Toi seul vois cette page. Un ajout, un changement ou un retrait s'applique en moins d'une minute.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="min-h-[44px] px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-sm flex items-center gap-2 disabled:opacity-50"
        >
          <RotateCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Actualiser
        </button>
      </div>

      {loadError && (
        <p className="rounded-xl border border-red-500/40 bg-red-950/40 p-3 text-sm text-red-200" role="alert">
          {loadError}
        </p>
      )}

      {data && (
        <form onSubmit={invite} className="rounded-2xl border border-amber-500/30 bg-slate-900/80 p-4 flex flex-col gap-4">
          <h4 className="text-sm font-bold text-white flex items-center gap-2">
            <UserPlus className="w-4 h-4 text-amber-400" />
            Inviter un administrateur
          </h4>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-300">Adresse Google de la personne</span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="prenom@gmail.com"
              className="min-h-[44px] px-3 rounded-xl bg-slate-950 border border-slate-700 text-white text-base focus:border-amber-500 outline-none"
            />
            <span className="text-xs text-slate-500">La personne doit s'être connectée au moins une fois au jeu avec ce compte Google.</span>
          </label>
          <RightsEditor data={data} permissions={rights} onChange={setRights} />
          {inviteError && <p className="text-sm text-red-300" role="alert">{inviteError}</p>}
          {inviteDone && (
            <p className="text-sm text-emerald-300 flex gap-2" role="status">
              <ShieldCheck className="w-4 h-4 shrink-0" />
              {inviteDone}
            </p>
          )}
          <button
            type="submit"
            disabled={inviting || !email.trim() || rights.length === 0}
            className="self-start min-h-[44px] px-5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-sm font-semibold flex items-center gap-2 disabled:opacity-50"
          >
            {inviting ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
            Donner l'accès
          </button>
        </form>
      )}

      {data && (
        <section className="flex flex-col gap-3">
          <h4 className="text-sm font-bold text-white">Avec accès ({active.length})</h4>
          {active.length === 0 ? (
            <p className="text-sm text-slate-400">Aucun administrateur ajouté pour le moment.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {active.map((admin) => (
                <AdminCard key={admin.uid} admin={admin} data={data} onChanged={() => void load()} />
              ))}
            </ul>
          )}
          {revoked.length > 0 && (
            <details className="rounded-xl border border-slate-800 p-3">
              <summary className="min-h-[44px] flex items-center cursor-pointer text-sm text-slate-400">Accès retirés ({revoked.length})</summary>
              <ul className="flex flex-col gap-1 pt-2">
                {revoked.map((admin) => (
                  <li key={admin.uid} className="text-sm text-slate-400 break-all">
                    {admin.email} · retiré le {formatDate(admin.revokedAt)}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>
      )}

      {data && (
        <section className="flex flex-col gap-2">
          <h4 className="text-sm font-bold text-white flex items-center gap-2">
            <History className="w-4 h-4 text-slate-400" />
            Derniers changements
          </h4>
          {history.length === 0 ? (
            <p className="text-sm text-slate-400">Aucun changement enregistré dans le journal.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {history.map((log) => (
                <li key={log.id} className="text-sm text-slate-300 flex flex-wrap gap-x-2">
                  <span className="text-slate-500">{new Date(log.timestamp).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}</span>
                  <span>{log.summary}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {loading && !data && (
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <Loader2 className="w-4 h-4 animate-spin" />
          Chargement…
        </div>
      )}
      {!loading && !data && !loadError && (
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <X className="w-4 h-4" />
          Rien à afficher.
        </div>
      )}
    </div>
  );
};
