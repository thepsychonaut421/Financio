
'use client';

import dynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';
import ProtectedRoute from '@/components/auth/ProtectedRoute';

const BankMatcherPageContent = dynamic(
  () => import('@/components/bank-matcher/BankMatcherPageContent').then(mod => mod.BankMatcherPageContent),
  {
    loading: () => (
      <div className="container mx-auto px-4 py-8 md:px-8 md:py-12 space-y-8">
        <header className="mb-8 text-center">
          <Skeleton className="h-10 w-3/4 mx-auto mb-2" />
          <Skeleton className="h-6 w-full max-w-md mx-auto" />
        </header>
        <main className="space-y-8">
          <Skeleton className="h-48 w-full max-w-2xl mx-auto" />
          <Skeleton className="h-16 w-full" />
           <div className="my-6 p-4 border rounded-lg shadow-sm bg-card">
            <Skeleton className="h-4 w-full mb-2" />
            <Skeleton className="h-4 w-1/2 mx-auto" />
          </div>
          <Skeleton className="h-64 w-full" />
        </main>
      </div>
    )
  }
);

export default function BankMatcherPage() {
  return (
    <ProtectedRoute>
      <BankMatcherPageContent />
    </ProtectedRoute>
  );
}
