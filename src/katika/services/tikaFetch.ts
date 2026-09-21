import { auth } from '../../lib/firebase';

/**
 * Client HTTP sécurisé pour l'espace d'administration Katika Master.
 * Injecte automatiquement le jeton Firebase ID de l'administrateur connecté
 * sous la forme « Authorization: Bearer <ID token> ».
 *
 * Si aucun utilisateur n'est connecté, aucun appel réseau n'est émis.
 */
export async function tikaFetch(url: string, init?: RequestInit): Promise<Response> {
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
