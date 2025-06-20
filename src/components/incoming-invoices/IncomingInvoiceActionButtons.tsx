
'use client';

import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { 
  incomingInvoicesToCSV, 
  incomingInvoicesToJSON, 
  incomingInvoicesToTSV,
  erpInvoicesToSupplierCSV, // Changed from incomingInvoicesToERPNextCSV
  incomingInvoicesToERPNextCSVComplete,
  downloadFile 
} from '@/lib/export-helpers';
import type { IncomingInvoiceItem, ERPIncomingInvoiceItem } from '@/types/incoming-invoice';
import { Copy, FileJson, FileSpreadsheet, ExternalLink, Users } from 'lucide-react'; // Added Users

interface IncomingInvoiceActionButtonsProps {
  invoices: IncomingInvoiceItem[] | ERPIncomingInvoiceItem[];
  erpMode: boolean;
  useMinimalErpExport: boolean; // This prop seems unused now with the simplified ERP export, but keeping for structure
  onExportToERPNext: () => void;
  isExportingToERPNext: boolean;
  onExportSuppliersERPNext: () => void; // New prop for supplier export
}

export function IncomingInvoiceActionButtons({ 
  invoices, 
  erpMode, 
  useMinimalErpExport, // Kept for now, though "minimal" vs "complete" CSV for invoices is now just one "complete"
  onExportToERPNext,
  isExportingToERPNext,
  onExportSuppliersERPNext // New prop
}: IncomingInvoiceActionButtonsProps) {
  const { toast } = useToast();

  const handleCopyToClipboard = async () => {
    if (invoices.length === 0) {
      toast({ title: "No data", description: "There is no invoice data to copy.", variant: "destructive" });
      return;
    }
    
    // TSV export for "complete" ERP mode will use the detailed invoice structure
    const tsvData = incomingInvoicesToTSV(invoices, erpMode, false); // force complete for TSV if erpMode
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
    // JSON export will always be "complete" style if in ERP mode
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
      // "Complete" ERPNext CSV for invoices is now the primary ERP export
      csvData = incomingInvoicesToERPNextCSVComplete(invoices as ERPIncomingInvoiceItem[]);
      fileName = 'erpnext_purchase_invoices_for_import.csv';
    } else {
      csvData = incomingInvoicesToCSV(invoices as IncomingInvoiceItem[]);
      fileName = 'extracted_incoming_invoices_standard.csv';
    }
    
    downloadFile(csvData, fileName, 'text/csv;charset=utf-8;');
    toast({ title: "Invoice CSV Exported", description: `Data for ${invoices.length} invoice(s) exported to CSV in ${erpMode ? `ERPNext Purchase Invoice` : 'Standard'} format.` });
  };

  if (invoices.length === 0) {
    return null;
  }

  return (
    <div className="my-6 flex flex-col sm:flex-row flex-wrap justify-center items-center gap-3 sm:gap-4">
      <Button onClick={handleCopyToClipboard} variant="outline" className="w-full sm:w-auto">
        <Copy className="mr-2 h-4 w-4" />
        Copy All {erpMode ? `(ERP Complete)` : ""}
      </Button>
      <Button onClick={handleExportJSON} variant="outline" className="w-full sm:w-auto">
        <FileJson className="mr-2 h-4 w-4" />
        Export All as JSON {erpMode ? `(Complete)` : ""}
      </Button>
      <Button onClick={handleExportInvoiceCSV} className="w-full sm:w-auto">
        <FileSpreadsheet className="mr-2 h-4 w-4" />
        Export Invoices CSV {erpMode ? `(ERPNext)` : ""}
      </Button>
      {erpMode && (
        <>
          <Button 
            onClick={onExportSuppliersERPNext} // Call new handler
            variant="secondary"
            className="w-full sm:w-auto"
            disabled={invoices.length === 0 || isExportingToERPNext} // Disable if exporting invoices
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
            {isExportingToERPNext ? 'Exporting Invoices...' : 'Export Invoices to ERPNext'}
          </Button>
        </>
      )}
    </div>
  );
}
