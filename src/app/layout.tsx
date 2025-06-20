import type {Metadata} from 'next';
import './globals.css';
import { Toaster } from "@/components/ui/toaster";
import { AppHeader } from '@/components/shared/AppHeader';
import { Inter } from 'next/font/google';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter', 
});

export const metadata: Metadata = {
  title: 'PDF Suite',
  description: 'Extract data from PDFs, organize files, and match bank statements using AI.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${inter.className}`}>
      <head>
        
      </head>
      <body className="antialiased min-h-screen flex flex-col">
        <AppHeader />
        <main className="flex-grow">
          {children}
        </main>
        <Toaster />
      </body>
    </html>
  );
}
