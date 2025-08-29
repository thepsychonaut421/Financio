
// src/lib/firebase-admin.ts
import type { Firestore } from 'firebase-admin/firestore';

let _dbP: Promise<Firestore|null> | null = null;

export function getAdminDbSafe(): Promise<Firestore|null> {
  if (_dbP) return _dbP;
  _dbP = (async () => {
    try {
      const { getApps, initializeApp, applicationDefault, cert } =
        await import('firebase-admin/app');
      const { getFirestore } = await import('firebase-admin/firestore');

      if (!getApps().length) {
        const pid = process.env.FB_PROJECT_ID;
        const email = process.env.FB_CLIENT_EMAIL;
        const pkRaw = process.env.FB_PRIVATE_KEY;
        if (pid && email && pkRaw) {
          initializeApp({ credential: cert({ projectId: pid, clientEmail: email, privateKey: pkRaw.replace(/\\n/g, '\n') }) });
        } else {
          initializeApp({ credential: applicationDefault() });
        }
      }
      return getFirestore();
    } catch (e) {
      console.error('[admin] init failed, translations disabled:', e);
      return null;
    }
  })();
  return _dbP;
}

    