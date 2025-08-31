
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

// This function will be called from the AuthContext to ensure it runs only on the client.
export async function initializeAppCheckIfNeeded() {
    // Only run on client
    if (typeof window !== 'undefined') {
        try {
            const { initializeAppCheck, ReCaptchaV3Provider } = await import('firebase/app-check');
            
            const debugToken = process.env.NEXT_PUBLIC_FIREBASE_APPCHECK_DEBUG_TOKEN;
            if (debugToken) {
                (window as any).FIREBASE_APPCHECK_DEBUG_TOKEN = debugToken;
            }

            const siteKey = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;
            
            // Initialize with debug token if present, otherwise with reCAPTCHA if the key is valid.
            initializeAppCheck(app, {
                provider: siteKey && siteKey !== 'RECAPTCHA_ENTERPRISE_SITE_KEY' && !debugToken
                    ? new ReCaptchaV3Provider(siteKey)
                    : undefined,
                isTokenAutoRefreshEnabled: true
            });
            console.log("Firebase App Check initialized successfully.");

        } catch (e) {
            console.error("Error initializing Firebase App Check:", e);
        }
    }
}


export { app, auth, db };
