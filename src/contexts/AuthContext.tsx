
'use client';

import React, { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';

interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  login: () => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const AUTH_TOKEN_KEY = 'financio_auth_token';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    try {
      const token = localStorage.getItem(AUTH_TOKEN_KEY);
      if (token) {
        setIsAuthenticated(true);
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
      router.push('/incoming-invoices'); // Default redirect after login
    } catch (error) {
      console.error("Failed to set auth token in localStorage:", error);
      // Handle error, maybe show a toast
    }
  };

  const logout = () => {
    try {
      localStorage.removeItem(AUTH_TOKEN_KEY);
      setIsAuthenticated(false);
      router.push('/login');
    } catch (error) {
      console.error("Failed to remove auth token from localStorage:", error);
      // Handle error
    }
  };
  
  // Effect to handle redirection if user is authenticated and tries to access /login
  useEffect(() => {
    if (!isLoading && isAuthenticated && pathname === '/login') {
      router.push('/incoming-invoices');
    }
  }, [isLoading, isAuthenticated, pathname, router]);

  return (
    <AuthContext.Provider value={{ isAuthenticated, isLoading, login, logout }}>
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
