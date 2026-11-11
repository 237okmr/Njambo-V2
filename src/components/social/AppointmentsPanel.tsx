import React, { useEffect, useMemo, useState } from 'react';
import { CalendarClock, Check, Clock, X } from 'lucide-react';
import { PlayerAvatar } from '../profile/PlayerAvatar';
import { useBackLayer } from '../../hooks/useBackLayer';
import type { AppointmentEntry } from '../../services/websocketService';
import { getPublicParamNumber } from '../../services/publicConfig';
import type { SocialMode } from '../../utils/socialCenter';
import { appointmentsForMode } from '../../utils/socialCenter';
import { formatAppointmentTime, fromDatetimeLocalValue, quickSlots, toDatetimeLocalValue } from '../../utils/appointmentTime';

const smallPrimary = 'h-8 px-3 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 text-slate-950 text-xs font-black flex items-center gap-1 shadow-sm active:scale-95 cursor-pointer disabled:opacity-50';
const smallSecondary = 'h-8 px-3 rounded-xl bg-slate-800 border border-slate-700 text-slate-200 text-xs font-bold flex items-center gap-1 hover:border-amber-500/50 active:scale-95 cursor-pointer';

/** « Rendez-vous » : mes propositions et celles qui m'attendent, du mode affiché seulement. Jamais de mise. */
export const AppointmentsSection: React.FC<{
  mode: SocialMode;
  items: readonly AppointmentEntry[];
  nowMs: number;
  onRespond: (id: string, answer: 'YES' | 'NO') => void;
  onCancel: (id: string) => void;
}> = ({ mode, items, nowMs, onRespond, onCancel }) => {
  const list = appointmentsForMode(items, mode);
  if (list.length === 0) return null;
  return (
    <section id="social-appointments" className="flex flex-col gap-2" aria-label="Rendez-vous">
      <span className="text-xs font-black uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
        <CalendarClock className="w-3.5 h-3.5" /> Rendez-vous
      </span>
      {list.map((a) => {
        const places = Math.max(0, 3 - a.yes.length);
        return (
          <div key={a.id} className={`p-3 rounded-2xl bg-slate-900 border flex flex-col gap-2 ${mode === 'CASH' ? 'border-amber-500/60' : 'border-slate-700'}`}>
            <div className="flex items-center gap-2.5">
              <PlayerAvatar avatarId={(a.organizerAvatar as any) || 'avatar_1'} size="sm" className="w-9 h-9 shrink-0" />
              <div className="min-w-0 flex-1">
                <span className="block truncate text-sm font-black text-white">
                  {formatAppointmentTime(a.startsAt, nowMs)}
                </span>
                <span className="block truncate text-xs text-slate-400">
                  {a.isMine ? 'Tu as proposé' : `Proposé par ${a.organizerName}`} · {mode === 'CASH' ? 'Kora Cash, sans mise' : 'Gratuit'}
                </span>
              </div>
            </div>
            <span className="text-xs text-slate-400">
              {a.yes.length === 0
                ? 'Personne n\'a encore répondu oui.'
                : `Partants : ${a.yes.map((p) => p.displayName).join(', ')}`}
              {a.full ? ' · complet' : places > 0 ? ` · encore ${places} place${places > 1 ? 's' : ''}` : ''}
            </span>
            <div className="flex items-center gap-2">
              {a.isMine ? (
                <button type="button" onClick={() => onCancel(a.id)} className={smallSecondary}>
                  <X className="w-3.5 h-3.5" /> Annuler
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    disabled={a.myAnswer !== 'YES' && a.full}
                    onClick={() => onRespond(a.id, 'YES')}
                    className={a.myAnswer === 'YES' ? `${smallPrimary} ring-2 ring-emerald-400` : smallPrimary}
                  >
                    <Check className="w-3.5 h-3.5" /> {a.myAnswer === 'YES' ? 'Tu viens' : 'Oui'}
                  </button>
                  <button type="button" onClick={() => onRespond(a.id, 'NO')} className={a.myAnswer === 'NO' ? `${smallSecondary} ring-2 ring-slate-500` : smallSecondary}>
                    <X className="w-3.5 h-3.5" /> {a.myAnswer === 'NO' ? 'Tu ne viens pas' : 'Non'}
                  </button>
                </>
              )}
            </div>
          </div>
        );
      })}
    </section>
  );
};

/** Bouton compact « Proposer un rendez-vous ». */
export const AppointmentStarter: React.FC<{ onOpen: () => void }> = ({ onOpen }) => (
  <button type="button" onClick={onOpen} className={`${smallSecondary} h-9 w-full justify-center`}>
    <CalendarClock className="w-4 h-4" />
    <span>Proposer un rendez-vous</span>
  </button>
);

export interface ComposerFriend {
  id: string;
  name: string;
  avatarId: string;
}

/** Formulaire de création : heure (raccourcis ou précise), amis cochés, ouverture aux joueurs qui ont activé les alertes. */
export const AppointmentComposer: React.FC<{
  open: boolean;
  mode: SocialMode;
  friends: readonly ComposerFriend[];
  onClose: () => void;
  onCreate: (input: { startsAt: number; inviteeIds: string[]; openToAlerts: boolean }) => void;
}> = ({ open, mode, friends, onClose, onCreate }) => {
  const [startsAt, setStartsAt] = useState<number | null>(null);
  const [picked, setPicked] = useState<Record<string, true>>({});
  const [openToAlerts, setOpenToAlerts] = useState(false);
  const [openedAt, setOpenedAt] = useState(0);

  useBackLayer(open, onClose);

  useEffect(() => {
    if (!open) return;
    setStartsAt(null);
    setPicked({});
    setOpenToAlerts(false);
    setOpenedAt(Date.now());
  }, [open]);

  const minLeadMs = getPublicParamNumber('appointmentMinLeadSeconds') * 1000;
  const horizonMs = getPublicParamNumber('appointmentHorizonHours') * 3_600_000;
  const slots = useMemo(() => quickSlots(openedAt, minLeadMs, horizonMs), [openedAt, minLeadMs, horizonMs]);

  if (!open) return null;

  const inviteeIds = Object.keys(picked);
  const hasAudience = inviteeIds.length > 0 || openToAlerts;
  const timeOk = startsAt !== null && startsAt - Date.now() >= minLeadMs && startsAt - Date.now() <= horizonMs;
  const canSend = timeOk && hasAudience;
  const togglePick = (id: string) =>
    setPicked((prev) => {
      const next = { ...prev };
      if (next[id]) delete next[id];
      else next[id] = true;
      return next;
    });

  return (
    <div className="fixed inset-0 z-[66] bg-black/70 flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-label="Proposer un rendez-vous">
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto bg-slate-950 border border-slate-800 rounded-t-3xl sm:rounded-3xl p-4 flex flex-col gap-3.5">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-base font-black text-white">
            <CalendarClock className="w-5 h-5 text-amber-400" /> Proposer un rendez-vous
          </span>
          <button type="button" aria-label="Fermer" onClick={onClose} className="w-8 h-8 rounded-full bg-slate-800 text-slate-300 flex items-center justify-center cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <span className="text-xs text-slate-400">
          {mode === 'CASH'
            ? 'Aucune mise : chacun choisit la sienne à l\'ouverture de la table Kora Cash. Réservé aux joueurs de 18 ans et plus qui ont accepté Kora Cash.'
            : 'Tes invités reçoivent un rappel avant l\'heure. À l\'heure, tu ouvres la table et ils te rejoignent.'}
        </span>

        <div className="flex flex-col gap-2">
          <span className="text-xs font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> Quand</span>
          <div className="flex flex-wrap gap-2">
            {slots.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setStartsAt(s.startsAt)}
                className={startsAt === s.startsAt ? smallPrimary : smallSecondary}
              >
                {s.label}
              </button>
            ))}
          </div>
          <label className="flex flex-col gap-1 text-xs text-slate-400">
            Ou une heure précise
            <input
              type="datetime-local"
              value={startsAt ? toDatetimeLocalValue(startsAt) : ''}
              min={toDatetimeLocalValue(openedAt + minLeadMs)}
              max={toDatetimeLocalValue(openedAt + horizonMs)}
              onChange={(e) => setStartsAt(fromDatetimeLocalValue(e.target.value))}
              className="h-10 px-3 rounded-xl bg-slate-900 border border-slate-700 text-sm text-white"
            />
          </label>
          {startsAt !== null && !timeOk && (
            <span className="text-xs text-rose-400">Cette heure est trop proche ou trop lointaine.</span>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-xs font-black uppercase tracking-wider text-slate-400">Qui</span>
          {friends.length === 0 ? (
            <span className="text-xs text-slate-500">Tu n'as pas encore d'ami confirmé.</span>
          ) : (
            <div className="flex flex-col gap-1.5 max-h-48 overflow-y-auto">
              {friends.map((f) => (
                <label key={f.id} className="flex items-center gap-2.5 p-2 rounded-xl bg-slate-900 border border-slate-800 cursor-pointer">
                  <input type="checkbox" checked={picked[f.id] === true} onChange={() => togglePick(f.id)} className="w-4 h-4 accent-amber-500" />
                  <PlayerAvatar avatarId={(f.avatarId as any) || 'avatar_1'} size="sm" className="w-7 h-7 shrink-0" />
                  <span className="min-w-0 flex-1 truncate text-sm font-bold text-white">{f.name}</span>
                </label>
              ))}
            </div>
          )}
          <label className="flex items-start gap-2.5 p-2 rounded-xl bg-slate-900 border border-slate-800 cursor-pointer">
            <input type="checkbox" checked={openToAlerts} onChange={(e) => setOpenToAlerts(e.target.checked)} className="w-4 h-4 mt-0.5 accent-amber-500" />
            <span className="text-sm text-slate-200">Ouvert aux joueurs qui ont activé les alertes</span>
          </label>
        </div>

        <span className="text-xs text-slate-500">Trois joueurs au plus peuvent répondre oui : la table est de quatre avec toi.</span>

        <button
          type="button"
          disabled={!canSend}
          onClick={() => startsAt !== null && onCreate({ startsAt, inviteeIds, openToAlerts })}
          className={`${smallPrimary} h-11 w-full justify-center text-sm`}
        >
          <CalendarClock className="w-4 h-4" />
          <span>Proposer</span>
        </button>
      </div>
    </div>
  );
};
