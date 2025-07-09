'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle, FilePlus, Info, Loader2, List, ExternalLink, CheckCircle, XCircle, PackageSearch } from 'lucide-react';
import { Table, TableBody, TableCell, TableHeader, TableHead, TableRow, TableCaption } from '@/components/ui/table';
import { enrichProductData, type EnrichedProduct } from '@/ai/flows/enrich-product-data';
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
      setErrorMessage("Please enter at least one product name.");
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
        errors.push(result.error || `Failed to process "${productName}".`);
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
        <h1 className="text-3xl md:text-4xl font-headline font-bold text-primary">Product Catalog Builder</h1>
        <p className="text-muted-foreground mt-2">
          Enter product names to generate detailed catalog entries using AI.
        </p>
      </header>

      <main className="space-y-8">
        <Card className="w-full max-w-2xl mx-auto shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-headline">
              <List className="w-6 h-6 text-primary" />
              Enter Product Names
            </CardTitle>
            <CardDescription>Enter one product name per line. The AI will generate a detailed entry for each.</CardDescription>
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
              {status === 'processing' ? 'Generating...' : 'Generate Catalog'}
            </Button>
            <Button onClick={handleClear} variant="outline" className="w-full">
                Clear
            </Button>
          </CardFooter>
        </Card>

        {errorMessage && (
          <Alert variant="destructive" className="my-6 whitespace-pre-wrap">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>An Error Occurred</AlertTitle>
            <AlertDescription>{errorMessage}</AlertDescription>
          </Alert>
        )}
        
        {status === 'idle' && enrichedProducts.length === 0 && (
          <Alert className="my-6 bg-primary/5 border-primary/20">
            <Info className="h-4 w-4 text-primary" />
            <AlertTitle className="text-primary font-semibold">Get Started</AlertTitle>
            <AlertDescription className="text-primary/80">
              Enter product names in the text area above to build your catalog.
            </AlertDescription>
          </Alert>
        )}

        {enrichedProducts.length > 0 && (
          <div className="space-y-6">
            <ProductCatalogActionButtons products={enrichedProducts} />
            {enrichedProducts.map((product, index) => (
              <Card key={`${product.originalProductName}-${index}`} className="shadow-lg overflow-hidden">
                <CardHeader>
                  <CardTitle className="font-headline text-xl text-primary">{product.enrichedTitle}</CardTitle>
                  <CardDescription>Original query: {product.originalProductName}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="flex flex-col md:flex-row gap-6">
                    <div className="flex-shrink-0">
                      <Image
                        src={product.imageUrl || "https://placehold.co/600x400.png"}
                        alt={product.enrichedTitle}
                        width={250}
                        height={250}
                        className="rounded-lg border object-cover"
                        data-ai-hint="product photo"
                      />
                    </div>
                    <p className="text-muted-foreground flex-grow">{product.description}</p>
                  </div>
                  
                  <div>
                    <h3 className="text-lg font-semibold mb-2">Specifications</h3>
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

                  <div>
                     <h3 className="text-lg font-semibold mb-2">Availability</h3>
                    <div className="overflow-x-auto rounded-md border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Store</TableHead>
                                    <TableHead>Price</TableHead>
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
                                                {item.inStock ? 'In Stock' : 'Out of Stock'}
                                            </span>
                                        </TableCell>
                                        <TableCell>
                                            <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline flex items-center gap-1">
                                                View <ExternalLink className="w-3 h-3" />
                                            </a>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                  </div>

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
