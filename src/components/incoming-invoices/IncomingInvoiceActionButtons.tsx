'use client';

import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { 
  incomingInvoicesToCSV, 
  incomingInvoicesToJSON, 
  incomingInvoicesToTSV, 
  downloadFile 
} from '@/lib/export-helpers';
import type { IncomingInvoiceItem } from '@/types/incoming-invoice';
import { CopyAll, FileJson, FileSpreadsheet } from 'lucide-react'; // Using FileSpreadsheet for CSV

interface IncomingInvoiceActionButtonsProps {
  invoices: IncomingInvoiceItem[];
}

export function IncomingInvoiceActionButtons({ invoices }: IncomingInvoiceActionButtonsProps) {
  const { toast } = useToast();

  const handleCopyToClipboard = async () => {
    if (invoices.length === 0) {
      toast({ title: "No data", description: "There is no invoice data to copy.", variant: "destructive" });
      return;
    }
    const tsvData = incomingInvoicesToTSV(invoices);
    try {
      await navigator.clipboard.writeText(tsvData);
      toast({ title: "Copied to clipboard!", description: `Data for ${invoices.length} invoice(s) copied successfully.` });
    } catch (err) {
      toast({ title: "Copy failed", description: "Could not copy data to clipboard.", variant: "destructive" });
      console.error('Failed to copy: ', err);
    }
  };

  const handleExportJSON = () => {
    if (invoices.length === 0) {
      toast({ title: "No data", description: "There is no invoice data to export.", variant: "destructive" });
      return;
    }
    const jsonData = incomingInvoicesToJSON(invoices);
    downloadFile(jsonData, 'extracted_incoming_invoices.json', 'application/json;charset=utf-8;');
    toast({ title: "JSON Exported", description: `Data for ${invoices.length} invoice(s) exported to JSON.` });
  };

  const handleExportCSV = () => {
    if (invoices.length === 0) {
      toast({ title: "No data", description: "There is no invoice data to export.", variant: "destructive" });
      return;
    }
    const csvData = incomingInvoicesToCSV(invoices);
    downloadFile(csvData, 'extracted_incoming_invoices.csv', 'text/csv;charset=utf-8;');
    toast({ title: "CSV Exported", description: `Data for ${invoices.length} invoice(s) exported to CSV.` });
  };

  if (invoices.length === 0) {
    return null;
  }

  return (
    <div className="my-6 flex flex-col sm:flex-row justify-center items-center gap-3 sm:gap-4">
      <Button onClick={handleCopyToClipboard} variant="outline" className="w-full sm:w-auto">
        <CopyAll className="mr-2 h-4 w-4" />
        Copy All to Clipboard
      </Button>
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
