import { useEffect, useState } from 'react';
import { wsService, AppointmentEntry } from '../services/websocketService';
import { getPublicParamNumber } from '../services/publicConfig';

/** Rendez-vous visibles : dernier état reçu, redemandé à la cadence de la liste « En ligne » tant que Social est ouvert. */
export function useAppointments(enabled: boolean, poll: boolean): AppointmentEntry[] {
  const [list, setList] = useState<AppointmentEntry[]>(() => wsService.getLastAppointments());

  useEffect(() => {
    if (!enabled) return;
    return wsService.onAppointments(setList);
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !poll) return;
    wsService.getAppointments();
    const interval = window.setInterval(() => {
      if (!document.hidden) wsService.getAppointments();
    }, getPublicParamNumber('clientOnlinePlayersPollSeconds') * 1000);
    return () => window.clearInterval(interval);
  }, [enabled, poll]);

  return enabled ? list : [];
}
