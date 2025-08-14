
import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

let app: FirebaseApp;

// This check prevents re-initialization on the client-side
if (typeof window !== 'undefined' && !getApps().length) {
  app = initializeApp(firebaseConfig);
} else if (typeof window !== 'undefined') {
  app = getApp();
}

// These functions will only be called on the client, where `app` is initialized.
// They will throw an error if called on the server, which is the desired behavior.
const getClientDb = () => getFirestore(app);
const getClientStorage = () => getStorage(app);
const getClientAuth = () => getAuth(app);

// Exporting functions to ensure they are evaluated lazily
export { 
    getClientDb as db, 
    getClientStorage as storage, 
    getClientAuth as auth 
};
