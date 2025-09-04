

import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyA7aXkeQUB1UCZtc_28szbBI6YV-w1dYl4",
  authDomain: "pdf-data-extractor-3krns.firebaseapp.com",
  databaseURL: "https://pdf-data-extractor-3krns-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "pdf-data-extractor-3krns",
  storageBucket: "pdf-data-extractor-3krns.appspot.com",
  messagingSenderId: "792878021257",
  appId: "1:792878021257:web:d5be381975efbb4a8da458"
};


// Initialize Firebase
const app: FirebaseApp = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const db = getFirestore(app);
const auth = getAuth(app);

// App Check initialization logic has been removed as it was causing persistent errors.
// This can be re-evaluated for production deployment.

export { app, auth, db };
