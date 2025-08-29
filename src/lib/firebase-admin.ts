// lib/firebase-admin.ts
import { getApps, initializeApp, applicationDefault, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const useADC = !!process.env.GOOGLE_CLOUD_PROJECT && !process.env.FB_PRIVATE_KEY;

const app = getApps()[0] ?? initializeApp(
  useADC
    ? { credential: applicationDefault() } // pe GCP/Hosting/Functions
    : {
        // fallback pentru local/dev cu .env
        credential: cert({
          projectId: process.env.FB_PROJECT_ID!,
          clientEmail: process.env.FB_CLIENT_EMAIL!,
          // IMPORTANT: cheile copiate în .env au \n literale – le restaurăm
          privateKey: (process.env.FB_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
        }),
      }
);

export const adminDb = getFirestore(app);
