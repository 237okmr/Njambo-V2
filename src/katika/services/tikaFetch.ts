import { auth } from '../../lib/firebase';
import { needsStrongConfirm } from '../utils/homeItems';
import { isCompactScreen } from '../hooks/useIsCompactScreen';
import { requestStrongConfirm } from '../components/KatikaStrongConfirm';

/**
 * Client HTTP sécurisé pour l'espace d'administration Katika Master.
 * Injecte automatiquement le jeton Firebase ID de l'administrateur connecté
 * sous la forme « Authorization: Bearer <ID token> ».
 *
 * Si aucun utilisateur n'est connecté, aucun appel réseau n'est émis.
 */
export async function tikaFetch(url: string, init?: RequestInit): Promise<Response> {
  // Action Kora Cash depuis un téléphone : confirmation renforcée avant tout envoi.
  if (needsStrongConfirm(init?.method, url, isCompactScreen())) {
    const action = url.replace('/api/katika/cash/', '').split('/').join(' › ');
    const ok = await requestStrongConfirm(`Action demandée : ${action}.`);
    if (!ok) throw new Error('Action annulée : confirmation renforcée non donnée.');
  }

  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('Non authentifié : session administrateur Katika requise.');
  }

  const token = await currentUser.getIdToken();
  if (!token) {
    throw new Error('Impossible de récupérer le jeton d\'authentification administrateur.');
  }

  const headers = new Headers(init?.headers);
  headers.set('Authorization', `Bearer ${token}`);

  return fetch(url, {
    ...init,
    headers,
  });
}
