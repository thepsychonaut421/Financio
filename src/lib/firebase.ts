
import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getAuth } from 'firebase/auth';
import * as admin from 'firebase-admin';

// --- Server-side Firebase Admin Initialization ---
// Ensure this is only run on the server

const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;

if (typeof window === 'undefined' && !admin.apps.length) { // Check if on server and not already initialized
  const serviceAccount: admin.ServiceAccount = serviceAccountKey
    ? JSON.parse(serviceAccountKey)
    : {};

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  });
}

export const adminDb = admin.firestore();
export const adminStorage = admin.storage();
export const adminAuth = admin.auth();


// --- Client-side Firebase Initialization ---
// This part is for client-side usage (e.g., in React components)

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

let app: FirebaseApp;
if (typeof window !== 'undefined' && !getApps().length) { // Check if on client and not already initialized
  app = initializeApp(firebaseConfig);
} else if (typeof window !== 'undefined') {
  app = getApp();
}

// Export client-side services, but ensure they are only initialized on the client
const getClientDb = () => getFirestore(app);
const getClientStorage = () => getStorage(app);
const getClientAuth = () => getAuth(app);

export { getClientDb as db, getClientStorage as storage, getClientAuth as auth };
