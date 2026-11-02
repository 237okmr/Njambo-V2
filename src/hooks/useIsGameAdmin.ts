import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { isAdminIdentity } from '../utils/adminAccess';

/** Vrai pour un compte d'administration connecté. Ne sert qu'à afficher les outils techniques dans le jeu. */
export function useIsGameAdmin(): boolean {
  const [isAdmin, setIsAdmin] = useState<boolean>(false);

  useEffect(() => {
    let cancelled = false;
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user || user.isAnonymous) {
        setIsAdmin(false);
        return;
      }
      try {
        const token = await user.getIdTokenResult();
        if (!cancelled) setIsAdmin(isAdminIdentity(user.email, token.claims));
      } catch {
        // jeton illisible : seule l'adresse du propriétaire reste vérifiable
        if (!cancelled) setIsAdmin(isAdminIdentity(user.email));
      }
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  return isAdmin;
}
