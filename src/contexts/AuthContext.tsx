'use client';

import React, { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { onAuthStateChanged, type User, signInWithEmailAndPassword, signOut, getRedirectResult } from 'firebase/auth';
import { useToast } from '@/hooks/use-toast';
import { auth } from '@/lib/firebase';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, pass: string) => Promise<void>;
  logout: () => void;
  getIdToken: (forceRefresh?: boolean) => Promise<string | null>;
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
    
    // Check for redirect result from OAuth
    getRedirectResult(auth)
      .then((result) => {
        if (result) {
           // This gives you a Microsoft Access Token. You can use it to access the Microsoft API.
           // const credential = OAuthProvider.credentialFromResult(result);
           // const accessToken = credential?.accessToken;
           // const user = result.user;
           toast({
               title: "Sign-In Successful",
               description: `Welcome back, ${result.user.displayName || result.user.email}!`,
           });
        }
      }).catch((error) => {
        console.error("OAuth Redirect Error:", error);
        toast({
            title: "Sign-In Failed",
            description: error.message || "An unknown error occurred during sign-in.",
            variant: "destructive"
        });
      });


    return () => unsubscribe();
  }, [toast]);

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

  const logout = async () => {
    try {
      await signOut(auth);
      router.push('/login');
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  const getIdToken = async (forceRefresh: boolean = false): Promise<string | null> => {
    if (!auth.currentUser) return null;
    try {
        return await auth.currentUser.getIdToken(forceRefresh);
    } catch (error) {
        console.error("Error refreshing ID token:", error);
        await logout();
        return null;
    }
  };
  
  useEffect(() => {
    if (!isLoading && user && (pathname === '/login' || pathname === '/signup')) {
      router.push('/purchases');
    }
  }, [isLoading, user, pathname, router]);

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
