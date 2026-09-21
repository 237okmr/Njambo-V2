import { initializeApp, getApps, App } from 'firebase-admin/app';
import { getAuth, Auth } from 'firebase-admin/auth';
import firebaseConfig from '../firebase-applet-config.json';

let adminApp: App | null = null;
let adminAuth: Auth | null = null;

export function getFirebaseAdminAuth(): Auth {
  if (!adminAuth) {
    const projectId = process.env.FIREBASE_PROJECT_ID || firebaseConfig.projectId || 'jaunty-sunlight-8mln4';
    adminApp = getApps().length === 0 ? initializeApp({ projectId }) : getApps()[0];
    adminAuth = getAuth(adminApp);
  }
  return adminAuth;
}

export async function verifyFirebaseIdToken(idToken: string): Promise<{ uid: string; email?: string; emailVerified?: boolean; admin?: boolean } | null> {
  if (!idToken || typeof idToken !== 'string') return null;
  try {
    const auth = getFirebaseAdminAuth();
    const decoded = await auth.verifyIdToken(idToken);
    if (decoded && decoded.uid) {
      return {
        uid: decoded.uid,
        email: decoded.email,
        emailVerified: decoded.email_verified,
        admin: decoded.admin === true,
      };
    }
    return null;
  } catch (error) {
    console.warn('[FirebaseAdmin] Failed to verify ID token:', error);
    return null;
  }
}
