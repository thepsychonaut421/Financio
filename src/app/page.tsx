
'use client';

import dynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';

const LandingPageContent = dynamic(
  () => import('@/components/landing/LandingPageContent').then(mod => mod.LandingPageContent),
  {
    loading: () => (
      <div className="flex flex-col min-h-screen">
        <header className="container mx-auto px-4 md:px-8 py-16 md:py-24 text-center">
          <Skeleton className="h-12 w-3/4 mx-auto mb-6" />
          <Skeleton className="h-8 w-full max-w-2xl mx-auto mb-10" />
          <div className="flex justify-center gap-4">
            <Skeleton className="h-12 w-40" />
            <Skeleton className="h-12 w-40" />
          </div>
           <Skeleton className="h-[300px] md:h-[500px] w-full max-w-4xl mx-auto mt-12 md:mt-20 rounded-xl" />
        </header>
        <main className="container mx-auto px-4 md:px-8 py-16 md:py-24">
          <Skeleton className="h-10 w-1/2 mx-auto mb-4" />
          <Skeleton className="h-6 w-3/4 mx-auto mb-16" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            <Skeleton className="h-64 w-full rounded-lg" />
            <Skeleton className="h-64 w-full rounded-lg" />
            <Skeleton className="h-64 w-full rounded-lg" />
          </div>
        </main>
         <footer className="py-10 border-t">
          <Skeleton className="h-6 w-1/4 mx-auto" />
        </footer>
      </div>
    ),
    ssr: false, 
  }
);

export default function HomePage() {
  return <LandingPageContent />;
}
