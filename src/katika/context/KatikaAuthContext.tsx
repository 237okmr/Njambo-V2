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

export const KATIKA_AUTHORIZED_EMAIL = '237okmr@gmail.com';

interface KatikaAuthContextType {
  user: User | null;
  loading: boolean;
  isAuthorized: boolean;
  loginError: string | null;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
}

const KatikaAuthContext = createContext<KatikaAuthContextType | null>(null);

export const KatikaAuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [loginError, setLoginError] = useState<string | null>(null);

  useEffect(() => {
    // Enforce persistence across browser/app restarts
    setPersistence(auth, browserLocalPersistence).catch((err) => {
      console.warn('Katika session persistence setup:', err);
    });

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        // Strict email whitelist verification
        const normalizedEmail = (currentUser.email || '').trim().toLowerCase();
        if (normalizedEmail === KATIKA_AUTHORIZED_EMAIL.toLowerCase()) {
          setUser(currentUser);
          setLoginError(null);
          setLoading(false);
        } else {
          // Non-admin user: Keep their player session intact, but deny access to Katika cockpit
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
      if (email !== KATIKA_AUTHORIZED_EMAIL.toLowerCase()) {
        setUser(null);
        setLoginError(`Accès refusé : l'adresse ${email} n'est pas autorisée sur la station Katika Master.`);
        setLoading(false);
        return;
      }
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
    window.location.replace('/');
  };

  const isAuthorized = useMemo(() => {
    return !!user && (user.email || '').trim().toLowerCase() === KATIKA_AUTHORIZED_EMAIL.toLowerCase();
  }, [user]);

  const value = useMemo(() => ({
    user,
    loading,
    isAuthorized,
    loginError,
    loginWithGoogle,
    logout
  }), [user, loading, isAuthorized, loginError]);

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
