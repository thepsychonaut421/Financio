
'use client';

import React, { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import {
  onAuthStateChanged,
  type User,
  signInWithEmailAndPassword,
  signOut,
  getRedirectResult,
  setPersistence,
  browserLocalPersistence,
  signInWithCredential,
  OAuthProvider,
} from 'firebase/auth';
import { FirebaseError } from 'firebase/app';
import { useToast } from '@/hooks/use-toast';
import { auth } from '@/lib/firebase';
import { msalInstance } from '@/lib/msal';

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
  const [redirectHandled, setRedirectHandled] = useState<boolean>(false);
  const router = useRouter();
  const pathname = usePathname();
  const { toast } = useToast();

  // 1) Listen to auth state changes from Firebase
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // 2) Process redirect results from Firebase (Google/GitHub) and MSAL (Microsoft)
  useEffect(() => {
    let cancelled = false;
    
    const handleMsalRedirect = async () => {
        try {
            await msalInstance.initialize();
            const response = await msalInstance.handleRedirectPromise();
            if (response && response.account) {
                 if (cancelled) return;
                
                toast({ title: 'Processing Microsoft Sign-In...', description: 'Please wait.' });

                // Create a Firebase credential with the MSAL ID token
                const credential = OAuthProvider.credential({
                    idToken: response.idToken,
                    accessToken: response.accessToken, 
                });

                // Sign into Firebase with the credential
                await signInWithCredential(auth, credential);

                toast({
                  title: 'Sign-In Successful',
                  description: `Welcome back, ${response.account.name || response.account.username}!`,
                });

                router.replace('/purchases');
            }
        } catch (e: any) {
            console.error('MSAL Redirect Error:', e);
            toast({ title: 'Microsoft Sign-In Failed', description: e.message || 'An unknown error occurred during MSAL redirect.', variant: 'destructive' });
        }
    };

    const handleFirebaseRedirect = async () => {
        try {
            const result = await getRedirectResult(auth);
            if (!result || cancelled) return;

            toast({
              title: 'Sign-In Successful',
              description: `Welcome back, ${result.user.displayName || result.user.email}!`,
            });
            
            router.replace('/purchases');
        } catch(e) {
            const err = e as FirebaseError;
            console.error('Firebase OAuth Redirect Error:', err);
            const msg =
              err.code === 'auth/unauthorized-domain'
                ? `This app's domain is not authorized for social sign-in. Add it in Firebase Console → Authentication → Settings → Authorized domains.`
                : err.message || 'An unknown error occurred during sign-in.';
            toast({ title: 'Sign-In Failed', description: msg, variant: 'destructive', duration: 15000 });
        }
    };
    
    (async () => {
        await setPersistence(auth, browserLocalPersistence);
        
        await handleMsalRedirect();
        await handleFirebaseRedirect();

        if (!cancelled) {
            setRedirectHandled(true);
        }
    })();


    return () => {
      cancelled = true;
    };
  }, [router, toast]);


  const login = async (email: string, pass: string) => {
    try {
      await setPersistence(auth, browserLocalPersistence);
      await signInWithEmailAndPassword(auth, email, pass);
    } catch (e) {
      const err = e as FirebaseError;
      console.error('Login failed:', err.message);
      toast({ title: 'Login Failed', description: err.message, variant: 'destructive' });
    }
  };

  const logout = async () => {
    try {
      await msalInstance.logoutRedirect(); // Handles MSAL logout
      await signOut(auth); // Handles Firebase logout
      router.replace('/login');
    } catch (e) {
      console.error('Logout failed:', e);
    }
  };

  const getIdToken = async (forceRefresh = false): Promise<string | null> => {
    if (!auth.currentUser) return null;
    try {
      return await auth.currentUser.getIdToken(forceRefresh);
    } catch (e) {
      console.error('Error refreshing ID token:', e);
      await logout();
      return null;
    }
  };

  // 3) Redirect away from login/signup if user is already authenticated
  useEffect(() => {
    if (!isLoading && redirectHandled && user && (pathname === '/login' || pathname === '/signup')) {
      router.replace('/purchases');
    }
  }, [isLoading, redirectHandled, user, pathname, router]);

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: !!user, isLoading: isLoading || !redirectHandled, login, logout, getIdToken }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
