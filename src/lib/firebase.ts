
import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';
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
export function initializeAppCheckIfNeeded() {
    if (typeof window !== 'undefined') {
        const debugToken = process.env.NEXT_PUBLIC_FIREBASE_APPCHECK_DEBUG_TOKEN;
        if (debugToken) {
            (window as any).FIREBASE_APPCHECK_DEBUG_TOKEN = debugToken;
        }

        // Initialize with debug token or with reCAPTCHA if the key is present.
        const siteKey = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;
        if (debugToken || (siteKey && siteKey !== 'RECAPTCHA_ENTERPRISE_SITE_KEY')) {
             try {
                initializeAppCheck(app, {
                    provider: siteKey && !debugToken ? new ReCaptchaV3Provider(siteKey) : undefined,
                    isTokenAutoRefreshEnabled: true
                });
            } catch(e) {
                console.error("Error initializing Firebase App Check:", e);
            }
        } else {
             console.warn("reCAPTCHA key not found. App Check is running without a provider. This is only recommended for development with a debug token.");
        }
    }
}


export { app, auth, db };
