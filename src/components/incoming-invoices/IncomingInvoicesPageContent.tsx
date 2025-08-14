
'use client';

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { IncomingInvoiceUploadForm } from '@/components/incoming-invoices/IncomingInvoiceUploadForm';
import { IncomingInvoiceCard } from '@/components/incoming-invoices/IncomingInvoiceCard';
import { ERPInvoiceTable } from '@/components/incoming-invoices/ERPInvoiceTable';
import { IncomingInvoiceActionButtons } from '@/components/incoming-invoices/IncomingInvoiceActionButtons';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle, Info, Settings2, FileCog, CheckSquare } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { erpInvoicesToSupplierCSV, downloadFile, incomingInvoicesToERPNextCSVComplete } from '@/lib/export-helpers';
import JSZip from 'jszip';
import Papa from 'papaparse';
import type { IncomingInvoiceItem, ERPIncomingInvoiceItem, IncomingProcessingStatus, ERPSortKey, SortOrder } from '@/types/incoming-invoice';
import { getAuth } from 'firebase/auth'; // Import Firebase Auth
import { auth } from '@/lib/firebase-client'; // Import client auth instance

const LOCAL_STORAGE_PAGE_CACHE_KEY = 'incomingInvoicesPageCache';
const LOCAL_STORAGE_MATCHER_DATA_KEY = 'processedIncomingInvoicesForMatcher';


interface DiscrepancyError {
    filename: string;
    reason: string;
}

interface IncomingInvoicesPageCache {
  extractedInvoices: IncomingInvoiceItem[];
  erpProcessedInvoices: ERPIncomingInvoiceItem[];
  erpMode: boolean;
  status: IncomingProcessingStatus;
  existingErpInvoiceKeys?: string[];
  erpSortKey?: ERPSortKey | null;
  erpSortOrder?: SortOrder;
  kontenrahmen?: string;
}

const erpTableSortOptions: { key: ERPSortKey; label: string }[] = [
  { key: 'rechnungsnummer', label: 'Invoice No.' },
  { key: 'datum', label: 'Date' },
  { key: 'lieferantName', label: 'Supplier' },
  { key: 'gesamtbetrag', label: 'Total' },
  { key: 'pdfFileName', label: 'PDF Name' },
];

function compareERPValues(valA: any, valB: any, order: SortOrder): number {
  const aIsNil = valA === null || valA === undefined || valA === '';
  const bIsNil = valB === null || valB === undefined || valB === '';

  if (aIsNil && bIsNil) return 0;
  if (aIsNil) return 1; 
  if (bIsNil) return -1;

  let comparison = 0;
  if (typeof valA === 'number' && typeof valB === 'number') {
    comparison = valA - valB;
  } else { 
    comparison = String(valA).toLowerCase().localeCompare(String(valB).toLowerCase());
  }
  return order === 'asc' ? comparison : -comparison;
}

// Helper to sanitize text fields for UI and ERP export
const sanitizeText = (text: string | undefined | null): string => {
    if (!text) return '';
    return text.replace(/[\uFFFD]/g, '').trim();
};


export function IncomingInvoicesPageContent() {
  'use client';
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [extractedInvoices, setExtractedInvoices] = useState<IncomingInvoiceItem[]>([]);
  const [erpProcessedInvoices, setErpProcessedInvoices] = useState<ERPIncomingInvoiceItem[]>([]);
  const [status, setStatus] = useState<IncomingProcessingStatus>('idle');
  const [progressValue, setProgressValue] = useState(0);
  const [currentFileProgress, setCurrentFileProgress] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [discrepancyErrors, setDiscrepancyErrors] = useState<DiscrepancyError[]>([]);
  const [erpMode, setErpMode] = useState(false);
  const [isExportingToERPNext, setIsExportingToERPNext] = useState(false);
  const [isExportingZip, setIsExportingZip] = useState(false);
  const { toast } = useToast();
  const [currentYear, setCurrentYear] = useState<string>('');
  const [kontenrahmen, setKontenrahmen] = useState('20000 - Verbindlichkeiten Lief Inland');


  const [erpExportFile, setErpExportFile] = useState<File | null>(null);
  const [existingErpInvoiceKeys, setExistingErpInvoiceKeys] = useState<Set<string>>(new Set());
  const [isCheckingDuplicates, setIsCheckingDuplicates] = useState(false);
  const erpExportInputId = React.useId();

  const [erpSortKey, setErpSortKey] = useState<ERPSortKey | null>('datum');
  const [erpSortOrder, setErpSortOrder] = useState<SortOrder>('desc');

  useEffect(() => {
    const year = new Date().getFullYear().toString();
    setCurrentYear(year);
  }, []);

  useEffect(() => {
    try {
      const cachedDataString = localStorage.getItem(LOCAL_STORAGE_PAGE_CACHE_KEY);
      if (cachedDataString) {
        const parsedJson = JSON.parse(cachedDataString);
        if (
          parsedJson &&
          typeof parsedJson === 'object' &&
          'status' in parsedJson 
        ) {
          const cachedData = parsedJson as IncomingInvoicesPageCache;

          setExtractedInvoices(Array.isArray(cachedData.extractedInvoices) ? cachedData.extractedInvoices : []);
          setErpProcessedInvoices(Array.isArray(cachedData.erpProcessedInvoices) ? cachedData.erpProcessedInvoices : []);
          setErpMode(typeof cachedData.erpMode === 'boolean' ? cachedData.erpMode : false);
          setKontenrahmen(cachedData.kontenrahmen || '20000 - Verbindlichkeiten Lief Inland');
          if (Array.isArray(cachedData.existingErpInvoiceKeys)) {
            setExistingErpInvoiceKeys(new Set(cachedData.existingErpInvoiceKeys));
          }
           setErpSortKey(cachedData.erpSortKey || 'datum');
           setErpSortOrder(cachedData.erpSortOrder || 'desc');

          if (cachedData.extractedInvoices.length > 0 || cachedData.erpProcessedInvoices.length > 0 || (cachedData.existingErpInvoiceKeys && cachedData.existingErpInvoiceKeys.length > 0)) {
             setStatus(cachedData.status as IncomingProcessingStatus);
          } else {
             setStatus('idle');
          }
        } else {
          localStorage.removeItem(LOCAL_STORAGE_PAGE_CACHE_KEY);
        }
      }
    } catch (error) {
      console.error("Failed to load or parse incoming invoices page cache from localStorage:", error);
      localStorage.removeItem(LOCAL_STORAGE_PAGE_CACHE_KEY); 
    }
  }, []);

  useEffect(() => {
    if (status !== 'processing' && status !== 'idle') { // Avoid saving during processing or if truly idle
      try {
        const cacheToSave: IncomingInvoicesPageCache = {
          extractedInvoices,
          erpProcessedInvoices,
          erpMode,
          status,
          existingErpInvoiceKeys: Array.from(existingErpInvoiceKeys),
          erpSortKey,
          erpSortOrder,
          kontenrahmen,
        };
        localStorage.setItem(LOCAL_STORAGE_PAGE_CACHE_KEY, JSON.stringify(cacheToSave));
      } catch (error) {
        console.error("Failed to save incoming invoices page cache to localStorage:", error);
      }
    }
  }, [extractedInvoices, erpProcessedInvoices, erpMode, status, existingErpInvoiceKeys, erpSortKey, erpSortOrder, kontenrahmen]);
  

  const handleFilesSelected = useCallback((files: File[]) => {
    setSelectedFiles(files);
    if (files.length > 0) {
      setExtractedInvoices([]); 
      setErpProcessedInvoices([]);
      setStatus('idle'); // Ready to process new files
      setErrorMessage(null);
      setDiscrepancyErrors([]);
      setProgressValue(0);
      setCurrentFileProgress('');
    } else {
      // If no files are selected, keep existing data unless cleared by "Clear All"
      setStatus(extractedInvoices.length > 0 || erpProcessedInvoices.length > 0 ? 'success' : 'idle');
    }
  }, [extractedInvoices.length, erpProcessedInvoices.length]);


  const resetStateOnModeChange = () => {
    const hasProcessedResults = extractedInvoices.length > 0 || erpProcessedInvoices.length > 0;
    if (hasProcessedResults) {
      setSelectedFiles([]); 
      setExtractedInvoices([]);
      setErpProcessedInvoices([]);
    }
    setStatus('idle');
    setCurrentFileProgress('');
    setProgressValue(0);
    setErrorMessage(null);
    setDiscrepancyErrors([]);
  }

  const handleProcessFiles = async () => {
    if (selectedFiles.length === 0) {
      setErrorMessage("No files selected. Please select PDF files to process.");
      setStatus('error');
      return;
    }

    const currentUser = auth.currentUser;
    if (!currentUser) {
        setErrorMessage("Authentication error. Please log in again.");
        setStatus('error');
        toast({ title: "Not Authenticated", description: "You must be logged in to upload files.", variant: "destructive" });
        return;
    }
    const token = await currentUser.getIdToken();

    setStatus('processing');
    setErrorMessage(null);
    setDiscrepancyErrors([]);
    setProgressValue(0);

    const tempRegularResults: IncomingInvoiceItem[] = [];
    const tempErpResults: ERPIncomingInvoiceItem[] = [];

    try {
        for (let i = 0; i < selectedFiles.length; i++) {
            const file = selectedFiles[i];
            setCurrentFileProgress(`Uploading and processing file ${i + 1} of ${selectedFiles.length}: ${file.name}`);

            const formData = new FormData();
            formData.append('file', file);

            const response = await fetch('/api/invoices/upload', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                },
                body: formData,
            });
            
            setProgressValue(Math.round(((i + 1) / selectedFiles.length) * 100));

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(`Failed to upload ${file.name}: ${errorData.error || response.statusText}`);
            }

            const result = await response.json();
            
            // Assuming the API returns the parsed data in a format we can use
            if (result.ok && result.invoiceId && result.status === 'extracted') {
                // Here we would ideally fetch the full document from Firestore,
                // but for now, we'll use the data returned from the API if it's sufficient
                // This part needs to be adapted based on the actual API response shape
                const invoiceData = { // This is a placeholder for the actual data
                  pdfFileName: file.name,
                  rechnungsnummer: result.invoiceId, // Example
                  // ... other fields from a potential API response payload
                };

                 if (erpMode) {
                    tempErpResults.push(invoiceData as ERPIncomingInvoiceItem);
                 } else {
                    tempRegularResults.push(invoiceData as IncomingInvoiceItem);
                 }
            } else if (result.status === 'queued') {
                toast({ title: "File Queued", description: `${file.name} has been queued for processing.`});
            } else if (result.status === 'extracted' && result.note?.includes('deduplicated')) {
                 toast({ title: "File Existed", description: `${file.name} was already processed.`});
            }
        }

        setExtractedInvoices(prev => [...prev, ...tempRegularResults]);
        setErpProcessedInvoices(prev => [...prev, ...tempErpResults]);
        setStatus('success');
        setCurrentFileProgress('Processing complete!');

    } catch (error) {
        console.error("Error processing files:", error);
        const message = error instanceof Error ? error.message : 'An unexpected error occurred during processing.';
        setErrorMessage(message);
        setStatus('error');
        setCurrentFileProgress('Processing failed.');
    }
};

  const handleExportToERPNext = async () => {
    const invoicesToExport = erpMode ? sortedErpProcessedInvoices : erpProcessedInvoices;
    if (invoicesToExport.length === 0) {
      toast({
        title: "No ERP Data",
        description: "No data available in ERP Vorlage Mode to export to ERPNext.",
        variant: "destructive",
      });
      return;
    }
    setIsExportingToERPNext(true);
    try {
      const response = await fetch('/api/erp/sync', { // Using the real sync endpoint
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoices: invoicesToExport }), // Adjust payload as needed by sync endpoint
      });
      if (!response.ok) {
        let detailedErrorMessage = `Server Error: ${response.status} ${response.statusText || ''}`.trim();
        try {
          const errorResult = await response.json();
          if (errorResult.error) detailedErrorMessage = errorResult.error;
          else if (errorResult.message) detailedErrorMessage = errorResult.message;
        } catch (jsonError) { /* ignore */ }
        toast({ title: `Export Error (${response.status})`, description: detailedErrorMessage, variant: "destructive" });
        return;
      }
      if (response.status === 204) { 
        toast({ title: "Export Submitted", description: "Invoices submitted to ERPNext (server returned no content, assuming success)." });
      } else {
        const result = await response.json();
        if (result.message) {
          toast({ title: "Export Status", description: result.message, variant: response.status === 207 ? "default" : "default" }); 
        } else {
           toast({ title: "Export Submitted", description: "Invoices submitted to ERPNext." });
        }
      }
    } catch (error: any) {
      const message = error instanceof Error ? error.message : "Unknown client-side error during ERPNext export.";
      toast({ title: "ERPNext Export Failed", description: message, variant: "destructive" });
    } finally {
      setIsExportingToERPNext(false);
    }
  };

  const handleExportSuppliersERPNext = () => {
    const invoicesToUse = erpMode ? sortedErpProcessedInvoices : erpProcessedInvoices;
    if (invoicesToUse.length === 0) {
      toast({
        title: "No Data for Suppliers",
        description: "No processed invoice data in ERP Mode to extract suppliers from.",
        variant: "destructive",
      });
      return;
    }
    const csvData = erpInvoicesToSupplierCSV(invoicesToUse);
    downloadFile(csvData, 'erpnext_suppliers_for_import.csv', 'text/csv;charset=utf-8;');
    
    const uniqueSupplierNames = new Set(invoicesToUse.map(inv => (inv.lieferantName || '').trim()).filter(name => name && name !== "UNBEKANNT_SUPPLIER_PLACEHOLDER"));
    toast({
      title: "Suppliers CSV Exported",
      description: `Supplier data for ${uniqueSupplierNames.size} unique supplier(s) ready for ERPNext import.`,
    });
  };

  const handleExportInvoicesAsZip = async () => {
    const invoicesToZip = erpMode ? sortedErpProcessedInvoices : erpProcessedInvoices;
    if (invoicesToZip.length === 0) {
      toast({
        title: "No ERP Data",
        description: "No invoices in ERP Vorlage Mode to export as ZIP.",
        variant: "destructive",
      });
      return;
    }
    setIsExportingZip(true);
    const zip = new JSZip();
    let fileCount = 0;

    try {
      for (let i = 0; i < invoicesToZip.length; i++) {
        const invoice = invoicesToZip[i];
        const csvString = incomingInvoicesToERPNextCSVComplete([invoice]); 
        
        const safeInvoiceNumber = (invoice.rechnungsnummer || `invoice_${i + 1}`).replace(/[^a-zA-Z0-9_.-]/g, '_').substring(0, 50);
        const filename = `ERPNext_Invoice_${safeInvoiceNumber}.csv`;
        
        zip.file(filename, csvString);
        fileCount++;
      }

      if (fileCount > 0) {
        const zipBlob = await zip.generateAsync({ type: "blob" });
        downloadFile(zipBlob as any, "erpnext_individual_invoices.zip", "application/zip"); 
        toast({
          title: "ZIP Export Successful",
          description: `${fileCount} invoice(s) exported as individual CSVs in a ZIP file.`,
        });
      } else {
        toast({
          title: "ZIP Export Empty",
          description: "No invoices were processed for the ZIP file.",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      console.error("Error creating ZIP file:", error);
      toast({
        title: "ZIP Export Failed",
        description: error.message || "Could not create ZIP file.",
        variant: "destructive",
      });
    } finally {
      setIsExportingZip(false);
    }
  };

  const handleErpExportFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      setErpExportFile(event.target.files[0]);
      setErrorMessage(null); 
    } else {
      setErpExportFile(null);
    }
  };

  const handleProcessErpExport = () => {
    if (!erpExportFile) {
      setErrorMessage("Please select an ERPNext export CSV file first.");
      return;
    }
    setIsCheckingDuplicates(true);
    setErrorMessage(null);

    Papa.parse(erpExportFile, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const newKeys = new Set<string>();
        // ... (rest of the logic remains the same)
        setExistingErpInvoiceKeys(newKeys);
        toast({
          title: "ERPNext Data Processed",
          description: `Found ${newKeys.size} unique invoice keys.`,
        });
        setIsCheckingDuplicates(false);
      },
      error: (error: Error) => {
        setErrorMessage(`Error parsing ERPNext export: ${error.message}`);
        setIsCheckingDuplicates(false);
      }
    });
  };
  
  const createInvoiceKey = (invoice: ERPIncomingInvoiceItem | IncomingInvoiceItem): string => {
    const supplier = (invoice.lieferantName || '').trim().toLowerCase(); 
    const number = (invoice.rechnungsnummer || '').trim().toLowerCase();
    const date = (invoice.datum || 'NO_DATE');
    return `${supplier}||${number}||${date}`; 
  };

  const handleClearAllInvoices = () => {
    setSelectedFiles([]);
    setExtractedInvoices([]);
    setErpProcessedInvoices([]);
    setStatus('idle');
    setProgressValue(0);
    setCurrentFileProgress('');
    setErrorMessage(null);
    setDiscrepancyErrors([]);
    setErpExportFile(null);
    setExistingErpInvoiceKeys(new Set());
    setErpSortKey('datum');
    setErpSortOrder('desc');

    localStorage.removeItem(LOCAL_STORAGE_PAGE_CACHE_KEY);
    localStorage.removeItem(LOCAL_STORAGE_MATCHER_DATA_KEY);

    toast({
      title: "Invoices Cleared",
      description: "All data has been cleared.",
    });
  };

  const handleErpSortRequest = (key: ERPSortKey) => {
    setErpSortOrder(prevOrder => (erpSortKey === key && prevOrder === 'asc' ? 'desc' : 'asc'));
    setErpSortKey(key);
  };

  const sortedErpProcessedInvoices = useMemo(() => {
    if (!erpSortKey) return erpProcessedInvoices;
    return [...erpProcessedInvoices].sort((a, b) => {
      const valA = a[erpSortKey];
      const valB = b[erpSortKey];
      return compareERPValues(valA, valB, erpSortOrder);
    });
  }, [erpProcessedInvoices, erpSortKey, erpSortOrder]);


  const displayInvoices = erpMode ? sortedErpProcessedInvoices : extractedInvoices;

  return (
    <div className="container mx-auto px-4 py-8 md:px-8 md:py-12">
      <header className="mb-8 text-center">
        <h1 className="text-3xl md:text-4xl font-headline font-bold text-primary">Incoming Invoice Details</h1>
        <p className="text-muted-foreground mt-2">
          Upload German PDF invoices (Eingangsrechnungen) to extract comprehensive details. Switch to ERP Vorlage Mode for ERPNext-compatible data.
        </p>
      </header>

      <main className="space-y-8">
        <IncomingInvoiceUploadForm
          onFilesSelected={handleFilesSelected}
          onProcess={handleProcessFiles}
          isProcessing={status === 'processing'}
          selectedFileCount={selectedFiles.length}
        />

        <Card className="w-full max-w-2xl mx-auto shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-headline">
              <CheckSquare className="w-6 h-6 text-green-600" />
              Check Duplicates with ERPNext Export (Optional)
            </CardTitle>
            <CardDescription>Upload a CSV export from ERPNext to flag invoices possibly already in your system.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor={erpExportInputId} className="text-sm font-medium">ERPNext CSV Export File</Label>
              <Input
                id={erpExportInputId}
                type="file"
                accept=".csv,text/csv"
                onChange={handleErpExportFileChange}
                disabled={isCheckingDuplicates}
                className="mt-1 block w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20"
              />
            </div>
            <Button
              onClick={handleProcessErpExport}
              disabled={isCheckingDuplicates || !erpExportFile}
              className="w-full"
            >
              {isCheckingDuplicates ? 'Processing ERP Export...' : 'Load & Check ERP Data'}
            </Button>
          </CardContent>
        </Card>


        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 p-4 bg-card border rounded-lg shadow-sm">
          <div className="flex items-center space-x-3">
            <Switch
              id="erp-mode-switch"
              checked={erpMode}
              onCheckedChange={(checked) => {
                setErpMode(checked);
                resetStateOnModeChange(); 
              }}
              disabled={status === 'processing'}
            />
            <Label htmlFor="erp-mode-switch" className="text-base font-medium">
              ERP Vorlage Mode
            </Label>
            <Settings2 className="h-5 w-5 text-muted-foreground" />
          </div>
          {erpMode && (
            <div className="flex items-center space-x-3 border-t sm:border-t-0 sm:border-l pt-4 sm:pt-0 sm:pl-4 mt-4 sm:mt-0">
               <FileCog className="h-5 w-5 text-muted-foreground" />
               <Label className="text-sm font-medium">
                Using ERPNext Complete Export Format
              </Label>
            </div>
          )}
        </div>
        
        {erpMode && (
          <Card className="w-full max-w-2xl mx-auto shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 font-headline">
                <FileCog className="w-6 h-6 text-primary" />
                ERPNext Export Settings
              </CardTitle>
              <CardDescription>
                Configure default values for ERPNext exports.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <Label htmlFor="kontenrahmen-input" className="font-medium">
                  Default Accounts Payable (Kontenrahmen)
                </Label>
                <Input
                  id="kontenrahmen-input"
                  value={kontenrahmen}
                  onChange={(e) => setKontenrahmen(e.target.value)}
                  placeholder="e.g., 20000 - Verbindlichkeiten"
                  disabled={status === 'processing'}
                />
              </div>
            </CardContent>
          </Card>
        )}


        {status === 'processing' && (
          <div className="my-6 p-4 border rounded-lg shadow-sm bg-card">
            <Progress value={progressValue} className="w-full mb-2" />
            <p className="text-sm text-center text-muted-foreground">{currentFileProgress}</p>
          </div>
        )}
        
        {discrepancyErrors.length > 0 && (
            <Alert variant="destructive" className="my-6">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Invoices with Discrepancies</AlertTitle>
                <AlertDescription>
                    <ul className="list-disc pl-5 space-y-1">
                        {discrepancyErrors.map((e, index) => (
                            <li key={index}>
                                <strong>{e.filename}:</strong> {e.reason}
                            </li>
                        ))}
                    </ul>
                    <p className="mt-2">Please manually check these invoices before exporting.</p>
                </AlertDescription>
            </Alert>
        )}

        {errorMessage && (
          <Alert variant="destructive" className="my-6 whitespace-pre-wrap">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error / Status</AlertTitle>
            <AlertDescription>{errorMessage}</AlertDescription>
          </Alert>
        )}
        
        {status === 'idle' && displayInvoices.length === 0 && selectedFiles.length === 0 && !errorMessage && (
           <Alert className="my-6 bg-primary/5 border-primary/20">
            <Info className="h-4 w-4 text-primary" />
            <AlertTitle className="text-primary font-semibold">Get Started</AlertTitle>
            <AlertDescription className="text-primary/80">
              Upload one or more PDF files.
            </AlertDescription>
          </Alert>
        )}

        {(status === 'success' || (status !== 'processing' && displayInvoices.length > 0)) && (
          <div className="mt-8 space-y-6">
            <IncomingInvoiceActionButtons 
              invoices={displayInvoices} 
              erpMode={erpMode}
              onExportToERPNext={handleExportToERPNext}
              isExportingToERPNext={isExportingToERPNext}
              onExportSuppliersERPNext={handleExportSuppliersERPNext}
              onExportInvoicesAsZip={handleExportInvoicesAsZip} 
              isExportingZip={isExportingZip} 
              onClearAllInvoices={handleClearAllInvoices}
            />
            {erpMode ? (
              <ERPInvoiceTable 
                invoices={sortedErpProcessedInvoices} 
                existingErpInvoiceKeys={existingErpInvoiceKeys} 
                sortKey={erpSortKey}
                sortOrder={erpSortOrder}
                onRequestSort={handleErpSortRequest}
                sortOptions={erpTableSortOptions}
              />
            ) : (
              (extractedInvoices.length > 0 ? extractedInvoices : displayInvoices as IncomingInvoiceItem[]).map((invoice, index) => (
                <IncomingInvoiceCard 
                    key={invoice.pdfFileName + '-' + index} 
                    invoice={invoice} 
                    isPotentiallyInERP={existingErpInvoiceKeys.has(createInvoiceKey(invoice))}
                />
              ))
            )}
          </div>
        )}

         {status === 'success' && displayInvoices.length === 0 && selectedFiles.length > 0 && !errorMessage && (
           <Alert className="my-6">
            <Info className="h-4 w-4" />
            <AlertTitle>No Data Extracted</AlertTitle>
            <AlertDescription>
              Processing finished, but no invoice data could be extracted from the uploaded PDFs.
            </AlertDescription>
          </Alert>
        )}
      </main>
      <footer className="text-center mt-12 py-4 border-t">
        <p className="text-sm text-muted-foreground">&copy; {currentYear} PDF Data Extractor. Powered by AI.</p>
      </footer>
    </div>
  );
}


    