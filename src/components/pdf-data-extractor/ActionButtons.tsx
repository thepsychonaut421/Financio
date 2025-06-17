'use client';

import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { arrayToCSV, downloadFile, itemsToTSV } from '@/lib/csv-helpers';
import type { ExtractedItem } from '@/types/invoice';
import { Copy, Download } from 'lucide-react';

interface ActionButtonsProps {
  items: ExtractedItem[];
}

export function ActionButtons({ items }: ActionButtonsProps) {
  const { toast } = useToast();

  const handleCopyToClipboard = async () => {
    if (items.length === 0) {
      toast({ title: "No data", description: "There is no data to copy.", variant: "destructive" });
      return;
    }
    const tsvData = itemsToTSV(items);
    try {
      await navigator.clipboard.writeText(tsvData);
      toast({ title: "Copied to clipboard!", description: `${items.length} items copied successfully.` });
    } catch (err) {
      toast({ title: "Copy failed", description: "Could not copy data to clipboard.", variant: "destructive" });
      console.error('Failed to copy: ', err);
    }
  };

  const handleExportCSV = () => {
    if (items.length === 0) {
      toast({ title: "No data", description: "There is no data to export.", variant: "destructive" });
      return;
    }
    const csvData = arrayToCSV(items);
    downloadFile(csvData, 'extracted_invoice_data.csv', 'text/csv;charset=utf-8;');
    toast({ title: "CSV Exported", description: `${items.length} items exported to CSV.` });
  };

  if (items.length === 0) {
    return null;
  }

  return (
    <div className="my-6 flex flex-col sm:flex-row justify-center gap-4">
      <Button onClick={handleCopyToClipboard} variant="outline" className="w-full sm:w-auto">
        <Copy className="mr-2 h-4 w-4" />
        Copy to Clipboard
      </Button>
      <Button onClick={handleExportCSV} className="w-full sm:w-auto">
        <Download className="mr-2 h-4 w-4" />
        Export as CSV
      </Button>
    </div>
  );
}
