
import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';

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

// Initialize App Check
if (typeof window !== 'undefined') {
    // self.FIREBASE_APPCHECK_DEBUG_TOKEN = true; // Uncomment for local debug if needed
    try {
        initializeAppCheck(app, {
            provider: new ReCaptchaV3Provider('6Ld5FbcrAAAAACkYWQDla0yJhXvSSHOVBUVAq6uv'), // Public reCAPTCHA Enterprise site key
            isTokenAutoRefreshEnabled: true
        });
        console.log("Firebase App Check initialized successfully.");
    } catch(e) {
        console.error("Error initializing Firebase App Check:", e);
    }
}

const auth = getAuth(app);

export { app, auth };
