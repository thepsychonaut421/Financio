'use client';

import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { productsToCSV, productsToJSON, downloadFile } from '@/lib/export-product-data';
import type { EnrichedProduct } from '@/ai/flows/enrich-product-data';
import { FileJson, FileSpreadsheet } from 'lucide-react';

interface ProductCatalogActionButtonsProps {
  products: EnrichedProduct[];
}

export function ProductCatalogActionButtons({ products }: ProductCatalogActionButtonsProps) {
  const { toast } = useToast();

  const handleExportJSON = () => {
    if (products.length === 0) {
      toast({ title: "No data", description: "There are no products to export.", variant: "destructive" });
      return;
    }
    const jsonData = productsToJSON(products);
    downloadFile(jsonData, 'product_catalog.json', 'application/json;charset=utf-8;');
    toast({ title: "JSON Exported", description: `${products.length} product(s) exported to JSON.` });
  };

  const handleExportCSV = () => {
    if (products.length === 0) {
      toast({ title: "No data", description: "There are no products to export.", variant: "destructive" });
      return;
    }
    const csvData = productsToCSV(products);
    downloadFile(csvData, 'product_catalog.csv', 'text/csv;charset=utf-8;');
    toast({ title: "CSV Exported", description: `${products.length} product(s) exported to CSV.` });
  };
  
  if (products.length === 0) {
    return null;
  }

  return (
    <div className="my-6 flex flex-col sm:flex-row justify-center items-center gap-4">
      <Button onClick={handleExportJSON} variant="outline" className="w-full sm:w-auto">
        <FileJson className="mr-2 h-4 w-4" />
        Export All as JSON
      </Button>
      <Button onClick={handleExportCSV} className="w-full sm:w-auto">
        <FileSpreadsheet className="mr-2 h-4 w-4" />
        Export All as CSV
      </Button>
    </div>
  );
}
