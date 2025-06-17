
'use client';

import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { 
  incomingInvoicesToCSV, 
  incomingInvoicesToJSON, 
  incomingInvoicesToTSV,
  incomingInvoicesToERPNextCSV,
  incomingInvoicesToERPNextCSVComplete,
  downloadFile 
} from '@/lib/export-helpers';
import type { IncomingInvoiceItem, ERPIncomingInvoiceItem } from '@/types/incoming-invoice';
import { Copy, FileJson, FileSpreadsheet } from 'lucide-react';

interface IncomingInvoiceActionButtonsProps {
  invoices: IncomingInvoiceItem[] | ERPIncomingInvoiceItem[];
  erpMode: boolean;
  useMinimalErpExport: boolean;
}

export function IncomingInvoiceActionButtons({ invoices, erpMode, useMinimalErpExport }: IncomingInvoiceActionButtonsProps) {
  const { toast } = useToast();

  const handleCopyToClipboard = async () => {
    if (invoices.length === 0) {
      toast({ title: "No data", description: "There is no invoice data to copy.", variant: "destructive" });
      return;
    }
    
    const tsvData = incomingInvoicesToTSV(invoices, erpMode, useMinimalErpExport);
    try {
      await navigator.clipboard.writeText(tsvData);
      toast({ title: "Copied to clipboard!", description: `Data for ${invoices.length} invoice(s) copied successfully in ${erpMode ? `ERP (${useMinimalErpExport ? 'Minimal' : 'Complete'})` : 'Standard'} format.` });
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
    const fileName = erpMode ? `erp_extracted_incoming_invoices${useMinimalErpExport ? '_minimal' : '_complete'}.json` : 'extracted_incoming_invoices.json';
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
      if (useMinimalErpExport) {
        csvData = incomingInvoicesToERPNextCSV(invoices as ERPIncomingInvoiceItem[]);
        fileName = 'erp_extracted_incoming_invoices_minimal.csv';
      } else {
        csvData = incomingInvoicesToERPNextCSVComplete(invoices as ERPIncomingInvoiceItem[]);
        fileName = 'erp_extracted_incoming_invoices_complete.csv';
      }
    } else {
      csvData = incomingInvoicesToCSV(invoices as IncomingInvoiceItem[]);
      fileName = 'extracted_incoming_invoices.csv';
    }
    
    downloadFile(csvData, fileName, 'text/csv;charset=utf-8;');
    toast({ title: "CSV Exported", description: `Data for ${invoices.length} invoice(s) exported to CSV in ${erpMode ? `ERP (${useMinimalErpExport ? 'Minimal' : 'Complete'})` : 'Standard'} format.` });
  };

  if (invoices.length === 0) {
    return null;
  }

  const erpExportLabel = useMinimalErpExport ? "Minimal" : "Complete";

  return (
    <div className="my-6 flex flex-col sm:flex-row justify-center items-center gap-3 sm:gap-4">
      <Button onClick={handleCopyToClipboard} variant="outline" className="w-full sm:w-auto">
        <Copy className="mr-2 h-4 w-4" />
        Copy All {erpMode ? `(ERP ${erpExportLabel})` : ""}
      </Button>
      <Button onClick={handleExportJSON} variant="outline" className="w-full sm:w-auto">
        <FileJson className="mr-2 h-4 w-4" />
        Export All as JSON {erpMode ? `(${erpExportLabel})` : ""}
      </Button>
      <Button onClick={handleExportCSV} className="w-full sm:w-auto">
        <FileSpreadsheet className="mr-2 h-4 w-4" />
        Export All as CSV {erpMode ? `(ERP ${erpExportLabel})` : ""}
      </Button>
    </div>
  );
}

    
