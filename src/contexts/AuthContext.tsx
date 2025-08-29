
'use client';

import React, { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { getAuth, onAuthStateChanged, type User, signInWithEmailAndPassword, signOut, OAuthProvider, signInWithPopup } from 'firebase/auth';
import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { useToast } from '@/hooks/use-toast';

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Lazy initialization for Firebase app
let app: FirebaseApp;
if (getApps().length === 0) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApps()[0];
}

const auth = getAuth(app);

// Use a mocked user for local development to bypass emulator network issues
const mockUser = {
  uid: 'testuser',
  email: 'test@example.com',
  displayName: 'Test User',
  emailVerified: true,
};


interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: () => Promise<void>;
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
    // If mocking auth, just set the user and stop loading.
    if (process.env.NEXT_PUBLIC_MOCK_AUTH === 'true') {
      setUser(mockUser as User);
      setIsLoading(false);
      return;
    }

    // Otherwise, use real Firebase auth
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const login = async () => {
    // If mocking, we don't need to do anything as the user is already "logged in"
    if (process.env.NEXT_PUBLIC_MOCK_AUTH === 'true') {
       toast({ title: "Logged in (Mock)" });
       router.push('/incoming-invoices');
       return;
    }
      
    try {
      await signInWithEmailAndPassword(auth, "test@example.com", "password");
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
    if (process.env.NEXT_PUBLIC_MOCK_AUTH === 'true') {
       toast({ title: "Logged in with Microsoft (Mock)" });
       router.push('/incoming-invoices');
       return;
    }

    const provider = new OAuthProvider('microsoft.com');
    // Optional: Add scopes for specific data access
    // provider.addScope('mail.read');
    // provider.addScope('user.read');

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
    if (process.env.NEXT_PUBLIC_MOCK_AUTH === 'true') {
      setUser(null);
      router.push('/login');
      return;
    }
      
    try {
      await signOut(auth);
      router.push('/login');
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  const getIdToken = async (): Promise<string | null> => {
    if (process.env.NEXT_PUBLIC_MOCK_AUTH === 'true') {
      return 'mock-token';
    }
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
