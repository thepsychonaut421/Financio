
'use client';

import React, { type ReactNode } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { Skeleton } from '@/components/ui/skeleton';

interface ProtectedRouteProps {
  children: ReactNode;
}

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  React.useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isLoading, isAuthenticated, router]);

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8 md:px-8 md:py-12 space-y-8">
        <Skeleton className="h-10 w-3/4 mx-auto mb-2" />
        <Skeleton className="h-6 w-full max-w-md mx-auto mb-8" />
        <Skeleton className="h-48 w-full max-w-2xl mx-auto" />
        <Skeleton className="h-16 w-full max-w-md mx-auto" />
      </div>
    );
  }

  if (!isAuthenticated) {
    // Router.push is called in useEffect, this is a fallback or placeholder during redirect
    return (
         <div className="container mx-auto px-4 py-8 md:px-8 md:py-12 space-y-8 text-center">
            <p>Redirecting to login...</p>
            <Skeleton className="h-10 w-3/4 mx-auto mb-2" />
         </div>
    );
  }

  return <>{children}</>;
}
