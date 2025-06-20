
'use client';

import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { 
  incomingInvoicesToCSV, 
  incomingInvoicesToJSON, 
  incomingInvoicesToTSV,
  erpInvoicesToSupplierCSV,
  incomingInvoicesToERPNextCSVComplete,
  downloadFile 
} from '@/lib/export-helpers';
import type { IncomingInvoiceItem, ERPIncomingInvoiceItem } from '@/types/incoming-invoice';
import { Copy, FileJson, FileSpreadsheet, ExternalLink, Users, FileArchive } from 'lucide-react'; // Added FileArchive

interface IncomingInvoiceActionButtonsProps {
  invoices: IncomingInvoiceItem[] | ERPIncomingInvoiceItem[];
  erpMode: boolean;
  onExportToERPNext: () => void;
  isExportingToERPNext: boolean;
  onExportSuppliersERPNext: () => void;
  onExportInvoicesAsZip: () => void; // New prop for ZIP export
  isExportingZip: boolean; // New prop for ZIP export status
}

export function IncomingInvoiceActionButtons({ 
  invoices, 
  erpMode, 
  onExportToERPNext,
  isExportingToERPNext,
  onExportSuppliersERPNext,
  onExportInvoicesAsZip, // Consuming new prop
  isExportingZip // Consuming new prop
}: IncomingInvoiceActionButtonsProps) {
  const { toast } = useToast();

  const handleCopyToClipboard = async () => {
    if (invoices.length === 0) {
      toast({ title: "No data", description: "There is no invoice data to copy.", variant: "destructive" });
      return;
    }
    
    const tsvData = incomingInvoicesToTSV(invoices, erpMode); 
    try {
      await navigator.clipboard.writeText(tsvData);
      toast({ title: "Copied to clipboard!", description: `Data for ${invoices.length} invoice(s) copied successfully in ${erpMode ? `ERP (Complete)` : 'Standard'} format.` });
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
    const fileName = erpMode ? `erp_extracted_incoming_invoices_complete.json` : 'extracted_incoming_invoices.json';
    downloadFile(jsonData, fileName, 'application/json;charset=utf-8;');
    toast({ title: "JSON Exported", description: `Data for ${invoices.length} invoice(s) exported to JSON.` });
  };

  const handleExportInvoiceCSV = () => {
    if (invoices.length === 0) {
      toast({ title: "No data", description: "There is no invoice data to export.", variant: "destructive" });
      return;
    }
    let csvData;
    let fileName;
    if (erpMode) {
      csvData = incomingInvoicesToERPNextCSVComplete(invoices as ERPIncomingInvoiceItem[]);
      fileName = 'erpnext_purchase_invoices_for_import_ALL.csv'; // Renamed to specify it's all
    } else {
      csvData = incomingInvoicesToCSV(invoices as IncomingInvoiceItem[]);
      fileName = 'extracted_incoming_invoices_standard.csv';
    }
    
    downloadFile(csvData, fileName, 'text/csv;charset=utf-8;');
    toast({ title: "Invoice CSV Exported", description: `Data for ${invoices.length} invoice(s) exported to CSV in ${erpMode ? `ERPNext Purchase Invoice (All)` : 'Standard'} format.` });
  };

  if (invoices.length === 0) {
    return null;
  }

  return (
    <div className="my-6 flex flex-col sm:flex-row flex-wrap justify-center items-center gap-3 sm:gap-4">
      <Button onClick={handleCopyToClipboard} variant="outline" className="w-full sm:w-auto">
        <Copy className="mr-2 h-4 w-4" />
        Copy All {erpMode ? `(ERP Format)` : ""}
      </Button>
      <Button onClick={handleExportJSON} variant="outline" className="w-full sm:w-auto">
        <FileJson className="mr-2 h-4 w-4" />
        Export All as JSON {erpMode ? `(ERP Format)` : ""}
      </Button>
      <Button onClick={handleExportInvoiceCSV} className="w-full sm:w-auto">
        <FileSpreadsheet className="mr-2 h-4 w-4" />
        Export Invoices CSV {erpMode ? `(ERP - All in one)` : ""}
      </Button>
      {erpMode && (
        <>
          <Button 
            onClick={onExportInvoicesAsZip}
            variant="secondary"
            className="w-full sm:w-auto"
            disabled={isExportingZip || invoices.length === 0}
          >
            <FileArchive className="mr-2 h-4 w-4" />
            {isExportingZip ? 'Zipping...' : 'Export Invoices (ZIP)'}
          </Button>
          <Button 
            onClick={onExportSuppliersERPNext}
            variant="secondary"
            className="w-full sm:w-auto"
            disabled={isExportingToERPNext || invoices.length === 0} 
          >
            <Users className="mr-2 h-4 w-4" />
            Export Suppliers (ERP)
          </Button>
          <Button 
            onClick={onExportToERPNext} 
            className="w-full sm:w-auto"
            disabled={isExportingToERPNext || invoices.length === 0}
          >
            <ExternalLink className="mr-2 h-4 w-4" />
            {isExportingToERPNext ? 'Exporting...' : 'Submit to ERPNext API'}
          </Button>
        </>
      )}
    </div>
  );
}
