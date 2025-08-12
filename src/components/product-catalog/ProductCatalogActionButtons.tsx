'use client';

import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { productsToCSV, productsToJSON, downloadFile } from '@/lib/export-product-data';
import type { EnrichedProduct } from '@/ai/schemas/product-catalog-schema';
import { FileJson, FileSpreadsheet } from 'lucide-react';

interface ProductCatalogActionButtonsProps {
  products: EnrichedProduct[];
}

export function ProductCatalogActionButtons({ products }: ProductCatalogActionButtonsProps) {
  const { toast } = useToast();

  const handleExportJSON = () => {
    if (products.length === 0) {
      toast({ title: "Keine Daten", description: "Es gibt keine Produkte zum Exportieren.", variant: "destructive" });
      return;
    }
    const jsonData = productsToJSON(products);
    downloadFile(jsonData, 'produktkatalog.json', 'application/json;charset=utf-8;');
    toast({ title: "JSON exportiert", description: `${products.length} Produkt(e) nach JSON exportiert.` });
  };

  const handleExportCSV = () => {
    if (products.length === 0) {
      toast({ title: "Keine Daten", description: "Es gibt keine Produkte zum Exportieren.", variant: "destructive" });
      return;
    }
    const csvData = productsToCSV(products);
    downloadFile(csvData, 'produktkatalog.csv', 'text/csv;charset=utf-8;');
    toast({ title: "CSV exportiert", description: `${products.length} Produkt(e) nach CSV exportiert.` });
  };
  
  if (products.length === 0) {
    return null;
  }

  return (
    <div className="my-6 flex flex-col sm:flex-row justify-center items-center gap-4">
      <Button onClick={handleExportJSON} variant="outline" className="w-full sm:w-auto">
        <FileJson className="mr-2 h-4 w-4" />
        Alle als JSON exportieren
      </Button>
      <Button onClick={handleExportCSV} className="w-full sm:w-auto">
        <FileSpreadsheet className="mr-2 h-4 w-4" />
        Alle als CSV exportieren
      </Button>
    </div>
  );
}
