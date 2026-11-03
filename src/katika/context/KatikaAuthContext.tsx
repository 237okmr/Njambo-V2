import React, { createContext, useContext, useEffect, useState, useMemo } from 'react';
import { 
  User, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signOut as firebaseSignOut, 
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence
} from 'firebase/auth';
import { auth } from '../../lib/firebase';
import { tikaFetch } from '../services/tikaFetch';

import { KATIKA_AUTHORIZED_EMAIL } from '../../utils/adminAccess';

export { KATIKA_AUTHORIZED_EMAIL };

/** Droits du compte connecté, lus sur le serveur. Ils ne servent qu'à l'affichage : le serveur reste seul juge. */
export interface KatikaAccess {
  isOwner: boolean;
  permissions: string[];
}

/** Le propriétaire est reconnu tout de suite ; un autre compte n'entre que si le serveur lui reconnaît une fiche active. */
async function resolveAccess(user: User): Promise<KatikaAccess | null> {
  const email = (user.email || '').trim().toLowerCase();
  if (email === KATIKA_AUTHORIZED_EMAIL.toLowerCase()) return { isOwner: true, permissions: [] };
  try {
    const res = await tikaFetch('/api/katika/me');
    if (!res.ok) return null;
    const body = await res.json();
    return body?.success ? { isOwner: false, permissions: Array.isArray(body.permissions) ? body.permissions : [] } : null;
  } catch {
    return null;
  }
}

interface KatikaAuthContextType {
  user: User | null;
  access: KatikaAccess | null;
  loading: boolean;
  isAuthorized: boolean;
  loginError: string | null;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
}

const KatikaAuthContext = createContext<KatikaAuthContextType | null>(null);

export const KatikaAuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [access, setAccess] = useState<KatikaAccess | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [loginError, setLoginError] = useState<string | null>(null);

  useEffect(() => {
    // Enforce persistence across browser/app restarts
    setPersistence(auth, browserLocalPersistence).catch((err) => {
      console.warn('Katika session persistence setup:', err);
    });

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        try {
          const granted = await resolveAccess(currentUser);

          if (granted) {
            setAccess(granted);
            setUser(currentUser);
            setLoginError(null);
            setLoading(false);
          } else {
            setUser(null);
            setLoading(false);
            const isKatikaRoute = 
              window.location.pathname.toLowerCase().includes('katika') ||
              window.location.pathname.toLowerCase().includes('copilot') ||
              window.location.search.toLowerCase().includes('katika') ||
              window.location.search.toLowerCase().includes('copilot');
            if (isKatikaRoute) {
              window.location.replace('/');
            }
          }
        } catch (tokenErr) {
          console.warn('Katika auth check error:', tokenErr);
          setUser(null);
          setLoading(false);
        }
      } else {
        setUser(null);
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const loginWithGoogle = async () => {
    setLoading(true);
    setLoginError(null);
    try {
      await setPersistence(auth, browserLocalPersistence);
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      const credential = await signInWithPopup(auth, provider);
      
      const email = (credential.user?.email || '').trim().toLowerCase();
      const granted = await resolveAccess(credential.user);

      if (!granted) {
        setUser(null);
        setLoginError(`Accès refusé : l'adresse ${email} n'est pas autorisée sur la station Katika Master.`);
        setLoading(false);
        return;
      }
      setAccess(granted);
      setUser(credential.user);
    } catch (err: any) {
      if (err.code !== 'auth/popup-closed-by-user' && err.code !== 'auth/cancelled-popup-request') {
        console.error('Katika auth error:', err);
        setLoginError('Échec de la connexion. Veuillez réessayer.');
      }
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    try {
      await firebaseSignOut(auth);
    } catch (e) {
      // ignore
    }
    setUser(null);
    setAccess(null);
    window.location.replace('/');
  };

  const isAuthorized = useMemo(() => {
    return !!user;
  }, [user]);

  const value = useMemo(() => ({
    user,
    access,
    loading,
    isAuthorized,
    loginError,
    loginWithGoogle,
    logout
  }), [user, access, loading, isAuthorized, loginError]);

  return (
    <KatikaAuthContext.Provider value={value}>
      {children}
    </KatikaAuthContext.Provider>
  );
};

export function useKatikaAuth(): KatikaAuthContextType {
  const context = useContext(KatikaAuthContext);
  if (!context) {
    throw new Error('useKatikaAuth must be used within KatikaAuthProvider');
  }
  return context;
}
