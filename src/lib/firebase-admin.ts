
// src/lib/firebase-admin.ts
import { getApps, initializeApp, cert, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

let _app: App | null = null;
let _db: Firestore | null = null;

function initAdmin(): App | null {
  if (getApps().length) return getApps()[0]!;
  const projectId = process.env.FB_PROJECT_ID;
  const clientEmail = process.env.FB_CLIENT_EMAIL;
  let privateKey = process.env.FB_PRIVATE_KEY;

  if (!projectId || !clientEmail || !privateKey) {
    console.error('[admin] Missing envs', {
      hasProjectId: !!projectId, hasClientEmail: !!clientEmail, hasKey: !!privateKey
    });
    return null;
  }
  // dacă în .env.local ai \n escapate:
  privateKey = privateKey.replace(/\\n/g, '\n');

  try {
    _app = initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
    return _app;
  } catch (e: any) {
    console.error('[admin] init error:', e?.message || e);
    return null;
  }
}

export function getAdminApp(): App | null {
  return _app ?? initAdmin();
}

export async function getAdminDbSafe(): Promise<Firestore | null> {
  if (_db) return _db;
  const app = getAdminApp();
  if (!app) return null;
  try {
    _db = getFirestore(app);
    return _db;
  } catch (e) {
    console.error('[admin] db init failed:', e);
    return null;
  }
}
