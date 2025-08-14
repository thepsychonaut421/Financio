
'use client';

import React, { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import type { User } from 'firebase/auth'; // Using the type for simulation

interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: User | null; // Expose the (simulated) user object
  login: () => void;
  logout: () => void;
  getIdToken: () => Promise<string | null>; // Expose a function to get the token
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const AUTH_TOKEN_KEY = 'financio_auth_token';

// This is a simulated user object for the prototype
const simulatedUser = {
  uid: 'test-user-id',
  email: 'test@example.com',
  displayName: 'Test User',
  getIdToken: async () => 'dummy_id_token_from_simulated_user',
} as unknown as User;


export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [user, setUser] = useState<User | null>(null); // State for the user object
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    try {
      const token = localStorage.getItem(AUTH_TOKEN_KEY);
      if (token) {
        setIsAuthenticated(true);
        setUser(simulatedUser);
      }
    } catch (error) {
      console.error("Failed to access localStorage:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const login = () => {
    try {
      localStorage.setItem(AUTH_TOKEN_KEY, 'dummy_token_simulated_login');
      setIsAuthenticated(true);
      setUser(simulatedUser);
      router.push('/incoming-invoices');
    } catch (error) {
      console.error("Failed to set auth token in localStorage:", error);
    }
  };

  const logout = () => {
    try {
      localStorage.removeItem(AUTH_TOKEN_KEY);
      setIsAuthenticated(false);
      setUser(null);
      router.push('/login');
    } catch (error) {
      console.error("Failed to remove auth token from localStorage:", error);
    }
  };

  const getIdToken = async (): Promise<string | null> => {
    if (!isAuthenticated) return null;
    try {
        const token = localStorage.getItem(AUTH_TOKEN_KEY);
        // In a real app, you would use user.getIdToken() and handle token refresh.
        // For this simulation, returning the stored token is sufficient.
        return token ? 'dummy_id_token_from_simulated_user' : null;
    } catch {
        return null;
    }
  };
  
  useEffect(() => {
    if (!isLoading && isAuthenticated && pathname === '/login') {
      router.push('/incoming-invoices');
    }
  }, [isLoading, isAuthenticated, pathname, router]);

  return (
    <AuthContext.Provider value={{ isAuthenticated, isLoading, user, login, logout, getIdToken }}>
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
