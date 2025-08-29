
'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle, FilePlus, Info, Loader2, List, ExternalLink, CheckCircle, XCircle, PackageSearch } from 'lucide-react';
import { Table, TableBody, TableCell, TableHeader, TableHead, TableRow } from '@/components/ui/table';
import { enrichProductData } from '@/ai/flows/enrich-product-data';
import type { EnrichedProduct } from '@/ai/schemas/product-catalog-schema';
import { ProductCatalogActionButtons } from './ProductCatalogActionButtons';
import type { ProductCatalogProcessingStatus } from '@/types/product';
import Image from 'next/image';

export function ProductCatalogPageContent() {
  const [productNames, setProductNames] = useState<string>('');
  const [enrichedProducts, setEnrichedProducts] = useState<EnrichedProduct[]>([]);
  const [status, setStatus] = useState<ProductCatalogProcessingStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [currentYear, setCurrentYear] = useState<string>('');

  useEffect(() => {
    setCurrentYear(new Date().getFullYear().toString());
  }, []);

  const handleProcessList = async () => {
    const productList = productNames.split('\n').filter(name => name.trim() !== '');
    if (productList.length === 0) {
      setErrorMessage("Bitte geben Sie mindestens einen Produktnamen ein.");
      setStatus('error');
      return;
    }

    setStatus('processing');
    setErrorMessage(null);
    setEnrichedProducts([]);
    const results: EnrichedProduct[] = [];
    const errors: string[] = [];

    for (const productName of productList) {
      const result = await enrichProductData({ productName });
      if (result.error || !result.product) {
        errors.push(result.error || `Verarbeitung von "${productName}" fehlgeschlagen.`);
      } else {
        results.push(result.product);
      }
    }

    setEnrichedProducts(results);
    if (errors.length > 0) {
      setErrorMessage(errors.join('\n'));
    }
    setStatus('success');
  };
  
  const handleClear = () => {
    setProductNames('');
    setEnrichedProducts([]);
    setStatus('idle');
    setErrorMessage(null);
  }

  return (
    <div className="container mx-auto px-4 py-8 md:px-8 md:py-12">
      <header className="mb-8 text-center">
        <h1 className="text-3xl md:text-4xl font-headline font-bold text-primary">Produktkatalog-Ersteller</h1>
        <p className="text-muted-foreground mt-2">
          Geben Sie Produktnamen ein, um mit KI detaillierte Katalogeinträge zu erstellen.
        </p>
      </header>

      <main className="space-y-8">
        <Card className="w-full max-w-2xl mx-auto shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-headline">
              <List className="w-6 h-6 text-primary" />
              Produktnamen eingeben
            </CardTitle>
            <CardDescription>Geben Sie einen Produktnamen pro Zeile ein. Die KI generiert für jeden einen detaillierten Eintrag.</CardDescription>
          </CardHeader>
          <CardContent>
            <textarea
              value={productNames}
              onChange={(e) => setProductNames(e.target.value)}
              placeholder="SILVERCREST® Küchenmaschine SKM 550 B3&#10;ERNESTO® Topfset, 6-tlg."
              className="w-full min-h-[100px] p-2 border rounded-md"
              disabled={status === 'processing'}
            />
          </CardContent>
          <CardFooter className="flex flex-col sm:flex-row gap-2">
            <Button
              onClick={handleProcessList}
              disabled={status === 'processing' || !productNames.trim()}
              className="w-full"
            >
              {status === 'processing' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PackageSearch className="mr-2 h-4 w-4" />}
              {status === 'processing' ? 'Wird generiert...' : 'Katalog erstellen'}
            </Button>
            <Button onClick={handleClear} variant="outline" className="w-full">
                Leeren
            </Button>
          </CardFooter>
        </Card>

        {errorMessage && (
          <Alert variant="destructive" className="my-6 whitespace-pre-wrap">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Ein Fehler ist aufgetreten</AlertTitle>
            <AlertDescription>{errorMessage}</AlertDescription>
          </Alert>
        )}
        
        {status === 'idle' && enrichedProducts.length === 0 && (
          <Alert className="my-6 bg-primary/5 border-primary/20">
            <Info className="h-4 w-4 text-primary" />
            <AlertTitle className="text-primary font-semibold">Los geht&apos;s</AlertTitle>
            <AlertDescription className="text-primary/80">
              Geben Sie Produktnamen in das obige Textfeld ein, um Ihren Katalog zu erstellen.
            </AlertDescription>
          </Alert>
        )}

        {enrichedProducts.length > 0 && (
          <div className="space-y-6">
            <ProductCatalogActionButtons products={enrichedProducts} />
            {enrichedProducts.map((product, index) => (
              <Card key={`${product.originalProductName}-${index}`} className="shadow-lg overflow-hidden">
                <CardHeader>
                  <CardTitle className="font-headline text-xl text-primary">{product.enrichedTitle || product.originalProductName}</CardTitle>
                  <CardDescription>Ursprüngliche Anfrage: {product.originalProductName}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="flex flex-col md:flex-row gap-6">
                    <div className="flex-shrink-0">
                      <Image
                        src={product.imageUrl || "https://placehold.co/600x400.png"}
                        alt={product.enrichedTitle || product.originalProductName}
                        width={250}
                        height={250}
                        className="rounded-lg border object-cover"
                        data-ai-hint="product photo"
                      />
                    </div>
                    <p className="text-muted-foreground flex-grow">{product.description || 'Keine Beschreibung verfügbar.'}</p>
                  </div>
                  
                  {product.specifications && product.specifications.length > 0 && (
                    <div>
                      <h3 className="text-lg font-semibold mb-2">Spezifikationen</h3>
                      <div className="overflow-x-auto rounded-md border">
                          <Table>
                              <TableBody>
                                  {product.specifications.map((spec, specIndex) => (
                                      <TableRow key={specIndex}>
                                          <TableCell className="font-medium">{spec.key}</TableCell>
                                          <TableCell>{spec.value}</TableCell>
                                      </TableRow>
                                  ))}
                              </TableBody>
                          </Table>
                      </div>
                    </div>
                  )}

                  {product.availability && product.availability.length > 0 && (
                    <div>
                      <h3 className="text-lg font-semibold mb-2">Verfügbarkeit</h3>
                      <div className="overflow-x-auto rounded-md border">
                          <Table>
                              <TableHeader>
                                  <TableRow>
                                      <TableHead>Shop</TableHead>
                                      <TableHead>Preis</TableHead>
                                      <TableHead>Status</TableHead>
                                      <TableHead>Link</TableHead>
                                  </TableRow>
                              </TableHeader>
                              <TableBody>
                                  {product.availability.map((item, availIndex) => (
                                      <TableRow key={availIndex}>
                                          <TableCell className="font-medium">{item.store}</TableCell>
                                          <TableCell>{item.price}</TableCell>
                                          <TableCell>
                                              <span className={`flex items-center gap-1.5 text-sm ${item.inStock ? 'text-green-600' : 'text-red-600'}`}>
                                                  {item.inStock ? <CheckCircle className="w-4 h-4"/> : <XCircle className="w-4 h-4"/>}
                                                  {item.inStock ? 'Auf Lager' : 'Nicht vorrätig'}
                                              </span>
                                          </TableCell>
                                          <TableCell>
                                              <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline flex items-center gap-1">
                                                  Ansehen <ExternalLink className="w-3 h-3" />
                                              </a>
                                          </TableCell>
                                      </TableRow>
                                  ))}
                              </TableBody>
                          </Table>
                      </div>
                    </div>
                  )}

                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
      <footer className="text-center mt-12 py-4 border-t">
        <p className="text-sm text-muted-foreground">&copy; {currentYear} Product Catalog Builder. Powered by AI.</p>
      </footer>
    </div>
  );
}
