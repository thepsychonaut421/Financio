
import * as admin from 'firebase-admin';

// This guard prevents re-initialization on hot reloads
if (!admin.apps.length) {
  const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!serviceAccountKey) {
    // In a production/deployed environment, this might rely on Application Default Credentials
    // For local dev or explicit setup, this key is crucial.
    console.log('FIREBASE_SERVICE_ACCOUNT_KEY not set. Initializing with Application Default Credentials.');
    admin.initializeApp({
        storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    });
  } else {
      try {
        console.log('Initializing Firebase with provided service account key.');
        const serviceAccount: admin.ServiceAccount = JSON.parse(serviceAccountKey);
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
          storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
        });
      } catch (error: any) {
        throw new Error(`Failed to parse FIREBASE_SERVICE_ACCOUNT_KEY or initialize Firebase Admin SDK: ${error.message}`);
      }
  }
}

const adminDb = admin.firestore();
const adminStorage = admin.storage();
const adminAuth = admin.auth();

export { admin, adminDb, adminStorage, adminAuth };
