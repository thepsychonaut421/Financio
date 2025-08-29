
'use client';

import React, { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { getAuth, onAuthStateChanged, type User, signInWithEmailAndPassword, signOut, OAuthProvider, signInWithPopup } from 'firebase/auth';
import { useToast } from '@/hooks/use-toast';
import { auth } from '@/lib/firebase'; // Import auth from the new firebase config file


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
