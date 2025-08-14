
import * as admin from 'firebase-admin';

// This guard prevents re-initialization on hot reloads
if (!admin.apps.length) {
  const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!serviceAccountKey) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY environment variable is not set. Cannot initialize Firebase Admin SDK.');
  }

  try {
    const serviceAccount: admin.ServiceAccount = JSON.parse(serviceAccountKey);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    });
  } catch (error: any) {
    throw new Error(`Failed to parse FIREBASE_SERVICE_ACCOUNT_KEY or initialize Firebase Admin SDK: ${error.message}`);
  }
}

export const adminDb = admin.firestore();
export const adminStorage = admin.storage();
export const adminAuth = admin.auth();
