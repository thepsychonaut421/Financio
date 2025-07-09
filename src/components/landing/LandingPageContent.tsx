'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { ListOrdered, ReceiptText, Landmark, FileEdit, FileScan, ArrowRight, Zap } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';

const features = [
  {
    title: 'Line Item Extractor',
    description: 'Automatically extract product codes, names, quantities, and prices from PDF invoices.',
    icon: <ListOrdered className="w-8 h-8" />,
    href: '/extractor',
  },
  {
    title: 'Incoming Invoice Details',
    description: 'Process German PDF invoices (Eingangsrechnungen) for comprehensive data extraction.',
    icon: <ReceiptText className="w-8 h-8" />,
    href: '/incoming-invoices',
  },
  {
    title: 'Bank Statement Matcher',
    description: 'Match bank transactions with processed PDF invoices automatically.',
    icon: <Landmark className="w-8 h-8" />,
    href: '/bank-matcher',
  },
  {
    title: 'PDF Organizer',
    description: 'Get intelligent filename suggestions for your PDFs and download them organized.',
    icon: <FileEdit className="w-8 h-8" />,
    href: '/pdf-organizer',
  },
  {
    title: 'Bank Statement Extractor',
    description: 'Extract transaction details from your bank statement PDFs efficiently.',
    icon: <FileScan className="w-8 h-8" />,
    href: '/bank-statement-extractor',
  },
];

export function LandingPageContent() {
  return (
    <div className="flex flex-col min-h-screen bg-background">
      <main className="flex-grow">
        {/* Hero Section */}
        <section className="py-16 md:py-24 bg-gradient-to-br from-primary/10 via-transparent to-transparent">
          <div className="container mx-auto px-4 md:px-8 text-center">
            <div
              className="inline-flex items-center justify-center px-4 py-1 mb-6 text-sm font-medium text-primary bg-primary/10 rounded-full"
              role="alert"
            >
              <Zap className="w-4 h-4 mr-2 animate-pulse" />
              <span>AI-Powered PDF Processing Suite</span>
            </div>
            <h1 className="text-4xl md:text-6xl font-bold font-headline text-primary mb-6">
              Unlock Your PDF Data
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground mb-10 max-w-3xl mx-auto">
              PDF Suite leverages cutting-edge AI to extract, organize, and manage your PDF documents and financial data with unparalleled speed and accuracy.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <Link href="/extractor">
                  <Button size="lg" className="font-semibold w-full sm:w-auto">
                    Get Started <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                </Link>
                <Link href="/login">
                    <Button size="lg" variant="outline" className="font-semibold w-full sm:w-auto">
                        Access Account
                    </Button>
                </Link>
            </div>
            <div className="mt-12 md:mt-20 relative">
              <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent opacity-50 rounded-lg"></div>
              <Image
                src="https://placehold.co/1000x563.png"
                alt="PDF Suite Dashboard Mockup"
                width={1000}
                height={563}
                className="rounded-xl shadow-2xl mx-auto relative z-10 border border-border"
                data-ai-hint="modern dashboard app"
                priority
              />
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section className="py-16 md:py-24">
          <div className="container mx-auto px-4 md:px-8">
            <h2 className="text-3xl md:text-4xl font-bold font-headline text-center mb-4 text-primary">
              Powerful Features, Effortless Workflow
            </h2>
            <p className="text-lg text-muted-foreground text-center mb-16 max-w-2xl mx-auto">
              From simple data extraction to complex financial matching, PDF Suite is designed to streamline your document-heavy tasks.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {features.map((feature) => (
                <Link href={feature.href} key={feature.title}>
                  <Card className="h-full hover:shadow-xl hover:border-primary/50 transition-all duration-300 cursor-pointer flex flex-col group bg-card hover:bg-primary/5">
                    <CardHeader className="items-center text-center">
                      <div className="p-4 bg-primary/10 rounded-full mb-4 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                        {feature.icon}
                      </div>
                      <CardTitle className="font-headline text-xl group-hover:text-primary transition-colors">{feature.title}</CardTitle>
                    </CardHeader>
                    <CardContent className="text-center text-muted-foreground flex-grow">
                      <p>{feature.description}</p>
                    </CardContent>
                    <CardFooter className="p-4 mt-auto">
                       <Button variant="ghost" className="w-full text-primary group-hover:bg-primary/10">
                        Explore Feature <ArrowRight className="ml-2 h-4 w-4" />
                      </Button>
                    </CardFooter>
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="text-center py-10 border-t bg-muted/50">
        <p className="text-sm text-muted-foreground">
          &copy; {new Date().getFullYear()} PDF Suite. All rights reserved.
        </p>
      </footer>
    </div>
  );
}
