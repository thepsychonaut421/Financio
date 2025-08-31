// src/lib/firebase-admin.ts
import { getApps, initializeApp, cert, type App, applicationDefault } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { AuthError } from './auth-error';

let _app: App | null = null;
let _db: Firestore | null = null;
let _initError: Error | null = null;

function initializeAdminApp(): App | null {
  if (getApps().length) {
    _app = getApps()[0]!;
    return _app;
  }
  
  if (_initError) {
      // Don't retry if we already have a fatal initialization error
      return null;
  }

  try {
    // Use Application Default Credentials, the recommended way for Firebase/Google Cloud environments
    _app = initializeApp({ credential: applicationDefault() });
    return _app;
  } catch (e: any) {
    console.error('[firebase-admin] Admin SDK initialization failed:', e?.message || e);
    _initError = new AuthError("Firebase Admin SDK initialization failed. Check server logs for details.");
    return null;
  }
}

export function getAdminApp(): App {
  const app = _app ?? initializeAdminApp();
  if (!app) {
    throw _initError || new AuthError("Firebase Admin SDK is not available.");
  }
  return app;
}


export async function getAdminDbSafe(): Promise<Firestore | null> {
  if (_db) return _db;
  try {
    const app = getAdminApp(); // This will throw if init fails
    _db = getFirestore(app);
    return _db;
  } catch (e) {
    // Error is already logged by getAdminApp, so we just return null
    return null;
  }
}
