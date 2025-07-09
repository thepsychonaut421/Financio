
'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Info, AlertCircle, Package, FileText, Tags, Image as ImageIcon, Link as LinkIcon } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import Image from 'next/image';
import type { EnrichedProduct, ProductCatalogProcessingStatus } from '@/types/product';
import { enrichProductData } from '@/ai/flows/enrich-product-data';
import { ProductCatalogActionButtons } from './ProductCatalogActionButtons';

export function ProductCatalogPageContent() {
  const [rawProductList, setRawProductList] = useState('');
  const [enrichedProducts, setEnrichedProducts] = useState<EnrichedProduct[]>([]);
  const [status, setStatus] = useState<ProductCatalogProcessingStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [currentYear, setCurrentYear] = useState('');

  useEffect(() => {
    setCurrentYear(new Date().getFullYear().toString());
  }, []);

  const handleProcessList = async () => {
    const productNames = rawProductList.split('\n').map(name => name.trim()).filter(name => name.length > 0);
    if (productNames.length === 0) {
      setErrorMessage("Please enter at least one product name.");
      setStatus('error');
      return;
    }

    setStatus('processing');
    setErrorMessage(null);
    setEnrichedProducts([]);

    try {
      const result = await enrichProductData({ productNames });

      if (result.error) {
        throw new Error(result.error);
      }

      if (result && result.enrichedProducts) {
        setEnrichedProducts(result.enrichedProducts);
        setStatus('success');
      } else {
        throw new Error("The AI returned an unexpected or empty result.");
      }
    } catch (error) {
      console.error("Error enriching product data:", error);
      const message = error instanceof Error ? error.message : "An unknown error occurred during enrichment.";
      setErrorMessage(message);
      setStatus('error');
    }
  };

  return (
    <div className="container mx-auto px-4 py-8 md:px-8 md:py-12">
      <header className="mb-8 text-center">
        <h1 className="text-3xl md:text-4xl font-headline font-bold text-primary">Product Catalog Builder</h1>
        <p className="text-muted-foreground mt-2 max-w-2xl mx-auto">
          Paste a list of raw product names (one per line) to automatically generate clean titles, descriptions, categories, and image suggestions.
        </p>
      </header>
      
      <main className="space-y-8">
        <Card className="w-full max-w-2xl mx-auto shadow-lg">
          <CardHeader>
            <CardTitle>1. Input Raw Product List</CardTitle>
            <CardDescription>Enter each product on a new line.</CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea
              value={rawProductList}
              onChange={(e) => setRawProductList(e.target.value)}
              placeholder="Example:\nSuper-Cool T-Shirt Blue-L\nSAMSUNG EVO 980 1TB SSD\nCoffee Mug 'Best Dad'"
              rows={8}
              className="text-base"
              disabled={status === 'processing'}
            />
          </CardContent>
          <CardFooter>
            <Button onClick={handleProcessList} disabled={status === 'processing' || !rawProductList.trim()} className="w-full" size="lg">
              {status === 'processing' ? 'Enriching Data...' : 'Enrich Product List'}
            </Button>
          </CardFooter>
        </Card>

        {status === 'processing' && (
          <div className="my-6 p-4 border rounded-lg shadow-sm bg-card">
            <Progress value={undefined} className="w-full mb-2 animate-pulse" />
            <p className="text-sm text-center text-muted-foreground">AI is working its magic... Please wait.</p>
          </div>
        )}

        {errorMessage && (
          <Alert variant="destructive" className="my-6">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{errorMessage}</AlertDescription>
          </Alert>
        )}
        
        {status === 'idle' && (
           <Alert className="my-6 bg-primary/5 border-primary/20">
            <Info className="h-4 w-4 text-primary" />
            <AlertTitle className="text-primary font-semibold">Ready to Go</AlertTitle>
            <AlertDescription className="text-primary/80">
              Input your product list above to get started. Results will appear here.
            </AlertDescription>
          </Alert>
        )}

        {status === 'success' && enrichedProducts.length > 0 && (
          <div className="space-y-6">
            <h2 className="text-2xl font-bold text-center font-headline text-primary">2. Review Enriched Products</h2>
            <ProductCatalogActionButtons products={enrichedProducts} />
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {enrichedProducts.map((product, index) => (
                <Card key={index} className="flex flex-col shadow-lg hover:shadow-xl transition-shadow duration-300">
                  <CardHeader>
                    <div className="relative aspect-square w-full mb-4">
                       <Image
                        src={product.foundImageUrl || `https://placehold.co/400x400.png`}
                        alt={`Image for ${product.enrichedTitle}`}
                        layout="fill"
                        objectFit="cover"
                        className="rounded-lg border bg-muted"
                        data-ai-hint={product.imageSearchKeywords}
                        unoptimized
                      />
                    </div>
                    <CardTitle className="font-headline text-lg text-primary flex items-center gap-2">
                        <Package className="w-5 h-5" />
                        {product.enrichedTitle}
                    </CardTitle>
                    <CardDescription className="text-xs">Original: {product.rawProductName}</CardDescription>
                  </CardHeader>
                  <CardContent className="flex-grow space-y-4">
                     <div>
                        <h4 className="font-semibold text-sm flex items-center gap-1 mb-1"><FileText className="w-4 h-4 text-muted-foreground" />Description</h4>
                        <p className="text-sm text-muted-foreground text-pretty">{product.enrichedDescription}</p>
                     </div>
                      <div>
                        <h4 className="font-semibold text-sm flex items-center gap-1 mb-2"><Tags className="w-4 h-4 text-muted-foreground" />Categories</h4>
                        <div className="flex flex-wrap gap-2">
                        {product.suggestedCategories.map((cat, i) => (
                            <Badge key={i} variant="secondary">{cat}</Badge>
                        ))}
                        </div>
                     </div>
                  </CardContent>
                   <CardFooter className="flex-col items-start gap-2 pt-4">
                       <div className="text-xs text-muted-foreground flex items-center gap-1.5"><ImageIcon className="w-3 h-3"/> <span>Image Hint: {product.imageSearchKeywords}</span></div>
                        {product.source && (
                          <div className="text-xs text-muted-foreground flex items-center gap-1.5 w-full truncate">
                            <LinkIcon className="w-3 h-3 flex-shrink-0"/> 
                            <span className="truncate">
                              Source: <a href={product.source} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{product.source}</a>
                            </span>
                          </div>
                        )}
                   </CardFooter>
                </Card>
              ))}
            </div>
          </div>
        )}
      </main>

       <footer className="text-center mt-12 py-4 border-t">
        <p className="text-sm text-muted-foreground">&copy; {currentYear} PDF Suite. AI Powered.</p>
      </footer>
    </div>
  );
}
