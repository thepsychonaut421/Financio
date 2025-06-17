'use client';

import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { 
  incomingInvoicesToCSV, 
  incomingInvoicesToJSON, 
  incomingInvoicesToTSV,
  incomingInvoicesToERPNextCSV,
  downloadFile 
} from '@/lib/export-helpers';
import type { IncomingInvoiceItem, ERPIncomingInvoiceItem } from '@/types/incoming-invoice';
import { Copy, FileJson, FileSpreadsheet } from 'lucide-react';

interface IncomingInvoiceActionButtonsProps {
  invoices: IncomingInvoiceItem[] | ERPIncomingInvoiceItem[]; // Can be either type
  erpMode: boolean;
}

export function IncomingInvoiceActionButtons({ invoices, erpMode }: IncomingInvoiceActionButtonsProps) {
  const { toast } = useToast();

  const handleCopyToClipboard = async () => {
    if (invoices.length === 0) {
      toast({ title: "No data", description: "There is no invoice data to copy.", variant: "destructive" });
      return;
    }
    // For simplicity, TSV copy remains consistent for both modes, adjust if ERP mode needs different clipboard format
    const tsvData = incomingInvoicesToTSV(invoices as IncomingInvoiceItem[]); // Cast for now
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
    const jsonData = incomingInvoicesToJSON(invoices); // Works for both types due to structure
    const fileName = erpMode ? 'erp_extracted_incoming_invoices.json' : 'extracted_incoming_invoices.json';
    downloadFile(jsonData, fileName, 'application/json;charset=utf-8;');
    toast({ title: "JSON Exported", description: `Data for ${invoices.length} invoice(s) exported to JSON.` });
  };

  const handleExportCSV = () => {
    if (invoices.length === 0) {
      toast({ title: "No data", description: "There is no invoice data to export.", variant: "destructive" });
      return;
    }
    let csvData;
    let fileName;
    if (erpMode) {
      csvData = incomingInvoicesToERPNextCSV(invoices as ERPIncomingInvoiceItem[]);
      fileName = 'erp_extracted_incoming_invoices.csv';
    } else {
      csvData = incomingInvoicesToCSV(invoices as IncomingInvoiceItem[]);
      fileName = 'extracted_incoming_invoices.csv';
    }
    
    downloadFile(csvData, fileName, 'text/csv;charset=utf-8;');
    toast({ title: "CSV Exported", description: `Data for ${invoices.length} invoice(s) exported to CSV.` });
  };

  if (invoices.length === 0) {
    return null;
  }

  return (
    <div className="my-6 flex flex-col sm:flex-row justify-center items-center gap-3 sm:gap-4">
      <Button onClick={handleCopyToClipboard} variant="outline" className="w-full sm:w-auto">
        <Copy className="mr-2 h-4 w-4" />
        Copy All to Clipboard
      </Button>
      <Button onClick={handleExportJSON} variant="outline" className="w-full sm:w-auto">
        <FileJson className="mr-2 h-4 w-4" />
        Export All as JSON
      </Button>
      <Button onClick={handleExportCSV} className="w-full sm:w-auto">
        <FileSpreadsheet className="mr-2 h-4 w-4" />
        Export All as CSV {erpMode ? "(ERP Format)" : ""}
      </Button>
    </div>
  );
}
