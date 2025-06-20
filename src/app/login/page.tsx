
'use client';

import dynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';
// No ProtectedRoute here, LoginPageContent handles its own auth check for redirection

const LoginPageContent = dynamic(
  () => import('@/components/auth/LoginPageContent').then(mod => mod.LoginPageContent),
  {
    loading: () => (
      <div className="flex items-center justify-center min-h-[calc(100vh-4rem)] p-4">
        <div className="w-full max-w-md space-y-6 p-8 border rounded-lg shadow-lg">
            <Skeleton className="h-10 w-24 mx-auto mb-4" /> 
            <Skeleton className="h-8 w-3/4 mx-auto" />
            <Skeleton className="h-6 w-full max-w-xs mx-auto mb-6" />
            <div className="space-y-4">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-12 w-full" />
            </div>
            <div className="space-y-4">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-12 w-full" />
            </div>
            <Skeleton className="h-12 w-full mt-4" />
            <Skeleton className="h-6 w-3/4 mx-auto mt-4" />
        </div>
      </div>
    ),
    ssr: false, 
  }
);

export default function LoginPage() {
  return <LoginPageContent />;
}
