
'use client';

import React, { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { getAuth, onAuthStateChanged, type User, signInWithEmailAndPassword, signOut, OAuthProvider, signInWithPopup } from 'firebase/auth';
import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';
import { useToast } from '@/hooks/use-toast';

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyA7aXkeQUB1UCZtc_28szbBI6YV-w1dYl4",
  authDomain: "pdf-data-extractor-3krns.firebaseapp.com",
  databaseURL: "https://pdf-data-extractor-3krns-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "pdf-data-extractor-3krns",
  storageBucket: "pdf-data-extractor-3krns.appspot.com",
  messagingSenderId: "792878021257",
  appId: "1:792878021257:web:d5be381975efbb4a8da458"
};


// Lazy initialization for Firebase app
let app: FirebaseApp;
if (getApps().length === 0) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApps()[0];
}

// Initialize App Check
if (typeof window !== 'undefined') {
    initializeAppCheck(app, {
        provider: new ReCaptchaV3Provider('6Lc-7wQqAAAAAPdGg5ZCRt1r6w6-4w5a4a5s6q7r'), // Public reCAPTCHA site key
        isTokenAutoRefreshEnabled: true
    });
}


const auth = getAuth(app);


interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, pass: string) => Promise<void>;
  logout: () => void;
  signInWithMicrosoft: () => Promise<void>;
  getIdToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const router = useRouter();
  const pathname = usePathname();
  const { toast } = useToast();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const login = async (email: string, pass: string) => {
    try {
      await signInWithEmailAndPassword(auth, email, pass);
      // On successful login, onAuthStateChanged will trigger and handle the redirect
    } catch (error: any) {
        console.error("Login failed:", error.message);
        toast({
          title: "Login Failed",
          description: error.message,
          variant: "destructive"
        });
    }
  };

  const signInWithMicrosoft = async () => {
    const provider = new OAuthProvider('microsoft.com');
    // Forcing the "common" tenant endpoint often resolves internal errors
    provider.setCustomParameters({
        tenant: 'common',
    });

    try {
        await signInWithPopup(auth, provider);
        // onAuthStateChanged will handle the user state update and redirect
    } catch (error: any) {
        console.error("Microsoft Sign-In failed:", error);
        toast({
            title: "Microsoft Sign-In Failed",
            description: error.message || "An unknown error occurred.",
            variant: "destructive"
        });
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

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: !!user, isLoading, login, logout, signInWithMicrosoft, getIdToken }}>
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
