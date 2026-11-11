import { useEffect, useState } from 'react';
import { wsService, SearchCallsSnapshot } from '../services/websocketService';
import { getPublicParamNumber } from '../services/publicConfig';

/**
 * Appels « je cherche une partie » : dernier état reçu du serveur. Le serveur pousse l'état dès qu'un appel nous concerne ;
 * tant que `poll` est vrai (écran Social ouvert), on le redemande à la cadence de la liste « En ligne ».
 */
export function useSearchCalls(enabled: boolean, poll: boolean): SearchCallsSnapshot {
  const [snapshot, setSnapshot] = useState<SearchCallsSnapshot>(() => wsService.getLastSearchCalls());

  useEffect(() => {
    if (!enabled) return;
    return wsService.onSearchCalls(setSnapshot);
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !poll) return;
    wsService.getSearchCalls();
    const interval = window.setInterval(() => {
      if (!document.hidden) wsService.getSearchCalls();
    }, getPublicParamNumber('clientOnlinePlayersPollSeconds') * 1000);
    return () => window.clearInterval(interval);
  }, [enabled, poll]);

  return enabled ? snapshot : { calls: [], mine: null };
}
