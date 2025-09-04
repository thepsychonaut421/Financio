

'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Info } from 'lucide-react';

export function SalesPageContent() {
  const [currentYear] = useState(new Date().getFullYear().toString());

  return (
    <div className="container mx-auto px-4 py-8 md:px-8 md:py-12">
      <header className="mb-8 text-center">
        <h1 className="text-3xl md:text-4xl font-headline font-bold text-primary">Sales Invoices</h1>
        <p className="text-muted-foreground mt-2">
          This module is for processing outgoing sales invoices. The functionality is under development.
        </p>
      </header>
      
      <main className="space-y-8">
        <Card className="w-full max-w-2xl mx-auto shadow-lg">
           <CardHeader>
              <CardTitle>Sales Invoice Processing</CardTitle>
              <CardDescription>
                Upload PDF files of sales invoices to extract details for ERPNext.
              </CardDescription>
            </CardHeader>
            <CardContent>
                <Alert>
                    <Info className="h-4 w-4" />
                    <AlertTitle>Module in Development</AlertTitle>
                    <AlertDescription>
                        The functionality for uploading and processing sales invoices is not yet implemented. Please check back later.
                    </AlertDescription>
                </Alert>
            </CardContent>
        </Card>
      </main>
      <footer className="text-center mt-12 py-4 border-t">
        <p className="text-sm text-muted-foreground">&copy; {currentYear} Financio. Powered by AI.</p>
      </footer>
    </div>
  );
}
