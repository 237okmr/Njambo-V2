import { initializeApp, getApps, App } from 'firebase-admin/app';
import { getAuth, Auth } from 'firebase-admin/auth';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import firebaseConfig from '../firebase-applet-config.json';

let adminApp: App | null = null;
let adminAuth: Auth | null = null;
let adminDb: Firestore | null = null;

export function getFirebaseAdminAuth(): Auth {
  if (!adminAuth) {
    const projectId = process.env.FIREBASE_PROJECT_ID || firebaseConfig.projectId || 'jaunty-sunlight-8mln4';
    adminApp = getApps().length === 0 ? initializeApp({ projectId }) : getApps()[0];
    adminAuth = getAuth(adminApp);
  }
  return adminAuth;
}

export function getFirebaseAdminDb(): Firestore {
  if (!adminDb) {
    const auth = getFirebaseAdminAuth();
    adminDb = getFirestore(adminApp!);
  }
  return adminDb;
}

/**
 * Base Firestore de l'application (celle utilisée par le client, voir src/lib/firebase.ts).
 * Attention : getFirebaseAdminDb() ci-dessus vise la base « (default) », qui n'est pas forcément celle de l'appli.
 */
export function getFirebaseAdminAppDb(): Firestore {
  getFirebaseAdminAuth(); // garantit l'initialisation de l'application admin
  const configuredId = (firebaseConfig as { firestoreDatabaseId?: string }).firestoreDatabaseId;
  const databaseId = configuredId && configuredId !== '(default)' ? configuredId : undefined;
  return databaseId ? getFirestore(adminApp!, databaseId) : getFirestore(adminApp!);
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

export interface AdminUserRecord {
  uid: string;
  email?: string;
  creationTime?: string;
  lastSignInTime?: string;
}

export async function listAdminUsers(): Promise<AdminUserRecord[]> {
  const auth = getFirebaseAdminAuth();
  const admins: AdminUserRecord[] = [];
  let pageToken: string | undefined = undefined;

  try {
    do {
      const listResult = await auth.listUsers(1000, pageToken);
      for (const user of listResult.users) {
        if (user.customClaims && user.customClaims.admin === true) {
          admins.push({
            uid: user.uid,
            email: user.email,
            creationTime: user.metadata.creationTime,
            lastSignInTime: user.metadata.lastSignInTime,
          });
        }
      }
      pageToken = listResult.pageToken;
    } while (pageToken);
  } catch (err) {
    console.error('[FirebaseAdmin] Error listing admin users:', err);
  }

  return admins;
}

export async function setAdminUserClaim(
  target: { uid?: string; email?: string },
  isAdmin: boolean
): Promise<{ uid: string; email?: string }> {
  const auth = getFirebaseAdminAuth();
  let userRecord;

  if (target.uid) {
    userRecord = await auth.getUser(target.uid);
  } else if (target.email) {
    userRecord = await auth.getUserByEmail(target.email.trim().toLowerCase());
  } else {
    throw new Error('Un UID ou un e-mail est requis pour modifier les privilèges administrateur.');
  }

  const currentClaims = userRecord.customClaims || {};
  const newClaims = { ...currentClaims };

  if (isAdmin) {
    newClaims.admin = true;
  } else {
    delete newClaims.admin;
  }

  await auth.setCustomUserClaims(userRecord.uid, newClaims);

  return {
    uid: userRecord.uid,
    email: userRecord.email,
  };
}

