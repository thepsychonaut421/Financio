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
} from 'firebase/auth';
import { FirebaseError } from 'firebase/app';
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
  const [redirectHandled, setRedirectHandled] = useState<boolean>(false);
  const router = useRouter();
  const pathname = usePathname();
  const { toast } = useToast();

  // 1) Ascultă schimbările de auth
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // 2) Procesează rezultatul redirect-ului O SINGURĂ DATĂ la mount,
  //    blochează orice altă redirecționare până la finalizare.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await setPersistence(auth, browserLocalPersistence);

        const result = await getRedirectResult(auth);
        if (!result || cancelled) {
          setRedirectHandled(true);
          return;
        }

        toast({
          title: 'Sign-In Successful',
          description: `Welcome back, ${result.user.displayName || result.user.email}!`,
        });

        // Important: replace, nu push (evită să rămână /login în back stack)
        router.replace('/purchases');
      } catch (e) {
        const err = e as FirebaseError;
        console.error('OAuth Redirect Error:', err);
        // Arată mesaje utile pe cazuri comune
        const msg =
          err.code === 'auth/unauthorized-domain'
            ? `This app's domain is not authorized for social sign-in. Add it in Firebase Console → Authentication → Settings → Authorized domains.`
            : err.message || 'An unknown error occurred during sign-in.';

        toast({ title: 'Sign-In Failed', description: msg, variant: 'destructive', duration: 15000 });
      } finally {
        if (!cancelled) setRedirectHandled(true);
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
      // Redirecția se va face în efectul de mai jos (după ce redirectHandled e true)
    } catch (e) {
      const err = e as FirebaseError;
      console.error('Login failed:', err.message);
      toast({ title: 'Login Failed', description: err.message, variant: 'destructive' });
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
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

  // 3) Redirecționează user-ul deja autentificat DE ABIA după ce am terminat redirect flow-ul.
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
