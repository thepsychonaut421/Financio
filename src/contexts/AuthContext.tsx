
'use client';

import React, { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { getAuth, onAuthStateChanged, type User, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { initializeApp, getApps } from 'firebase/app';
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Initialize Firebase
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

// Initialize App Check only if the reCAPTCHA site key is available
if (typeof window !== 'undefined') {
    if (process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY) {
        initializeAppCheck(app, {
          provider: new ReCaptchaV3Provider(process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY),
          isTokenAutoRefreshEnabled: true
        });
    }
}


interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: () => Promise<void>;
  logout: () => void;
  getIdToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const router = useRouter();
  const pathname = usePathname();
  const auth = getAuth(app);

  useEffect(() => {
    // Check if Firebase is configured
    if (!firebaseConfig.apiKey) {
      console.error("Firebase API Key is missing. Please check your .env.local file.");
      setIsLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [auth]);

  const login = async () => {
    try {
      // Using a dummy user for this simulation as per requirements
      await signInWithEmailAndPassword(auth, "test@example.com", "password");
      // On successful login, onAuthStateChanged will trigger and handle the redirect
    } catch (error: any) {
        console.error("Login failed:", error.message);
        // In a real app, you'd use the toast hook here
        alert("Login Failed: " + error.message);
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
      router.push('/login');
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  const getIdToken = async (): Promise<string | null> => {
    if (!auth.currentUser) return null;
    return auth.currentUser.getIdToken(true);
  };
  
  // Effect to handle redirection if user is authenticated and tries to access auth pages
  useEffect(() => {
    if (!isLoading && user && (pathname === '/login' || pathname === '/signup')) {
      router.push('/incoming-invoices');
    }
  }, [isLoading, user, pathname, router]);

  if (!firebaseConfig.apiKey) {
    return (
      <div className="flex h-screen items-center justify-center bg-red-100 text-red-800">
        <div className="p-8 text-center">
          <h1 className="text-2xl font-bold">Firebase Configuration Error</h1>
          <p className="mt-2">The Firebase API Key is missing. Please check your <code>.env.local</code> file and ensure all Firebase variables are set correctly.</p>
        </div>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: !!user, isLoading, login, logout, getIdToken }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
