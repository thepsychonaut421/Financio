
'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { IncomingInvoiceUploadForm } from '@/components/incoming-invoices/IncomingInvoiceUploadForm';
import { IncomingInvoiceCard } from '@/components/incoming-invoices/IncomingInvoiceCard';
import { ERPInvoiceTable } from '@/components/incoming-invoices/ERPInvoiceTable';
import { IncomingInvoiceActionButtons } from '@/components/incoming-invoices/IncomingInvoiceActionButtons';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle, Info, Settings2, FileCog } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { readFileAsDataURL } from '@/lib/file-helpers';
import { extractIncomingInvoiceData, type ExtractIncomingInvoiceDataOutput } from '@/ai/flows/extract-incoming-invoice-data';
import type { IncomingInvoiceItem, ERPIncomingInvoiceItem, IncomingProcessingStatus } from '@/types/incoming-invoice';
import { addDays, parseISO } from 'date-fns';
import { useToast } from '@/hooks/use-toast';

const LOCAL_STORAGE_PAGE_CACHE_KEY = 'incomingInvoicesPageCache';
const LOCAL_STORAGE_MATCHER_DATA_KEY = 'processedIncomingInvoicesForMatcher';

interface IncomingInvoicesPageCache {
  extractedInvoices: IncomingInvoiceItem[];
  erpProcessedInvoices: ERPIncomingInvoiceItem[];
  erpMode: boolean;
  useMinimalErpExport: boolean;
  status: IncomingProcessingStatus;
}

export function IncomingInvoicesPageContent() {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [extractedInvoices, setExtractedInvoices] = useState<IncomingInvoiceItem[]>([]);
  const [erpProcessedInvoices, setErpProcessedInvoices] = useState<ERPIncomingInvoiceItem[]>([]);
  const [status, setStatus] = useState<IncomingProcessingStatus>('idle');
  const [progressValue, setProgressValue] = useState(0);
  const [currentFileProgress, setCurrentFileProgress] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [erpMode, setErpMode] = useState(false);
  const [useMinimalErpExport, setUseMinimalErpExport] = useState(true);
  const [isExportingToERPNext, setIsExportingToERPNext] = useState(false);
  const { toast } = useToast();
  const [currentYear, setCurrentYear] = useState<string>('');

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
          'status' in parsedJson && 
          parsedJson.status === 'success'
        ) {
          const cachedData = parsedJson as IncomingInvoicesPageCache;

          setExtractedInvoices(Array.isArray(cachedData.extractedInvoices) ? cachedData.extractedInvoices : []);
          setErpProcessedInvoices(Array.isArray(cachedData.erpProcessedInvoices) ? cachedData.erpProcessedInvoices : []);
          setErpMode(typeof cachedData.erpMode === 'boolean' ? cachedData.erpMode : false);
          setUseMinimalErpExport(typeof cachedData.useMinimalErpExport === 'boolean' ? cachedData.useMinimalErpExport : true);
          setStatus('success'); 
        } else {
          console.warn("Cached data for incoming invoices is invalid or not a 'success' state, clearing.");
          localStorage.removeItem(LOCAL_STORAGE_PAGE_CACHE_KEY);
        }
      }
    } catch (error) {
      console.error("Failed to load or parse incoming invoices page cache from localStorage:", error);
      localStorage.removeItem(LOCAL_STORAGE_PAGE_CACHE_KEY);
    }
  }, []);

  useEffect(() => {
    if (status === 'success') {
      try {
        const cacheToSave: IncomingInvoicesPageCache = {
          extractedInvoices,
          erpProcessedInvoices,
          erpMode,
          useMinimalErpExport,
          status,
        };
        localStorage.setItem(LOCAL_STORAGE_PAGE_CACHE_KEY, JSON.stringify(cacheToSave));
      } catch (error) {
        console.error("Failed to save incoming invoices page cache to localStorage:", error);
      }
    }
  }, [extractedInvoices, erpProcessedInvoices, erpMode, useMinimalErpExport, status]);


  const supplierMap: Record<string, string> = {
    "LIDL": "Lidl",
    "LIDL DIGITAL DEUTSCHLAND GMBH & CO. KG": "Lidl", 
    "GD ARTLANDS ETRADING GMBH": "GD Artlands eTrading GmbH",
    "RETOURA": "RETOURA",
    "DOITBAU GMBH & CO.KG": "doitBau",
    "KAUFLAND": "Kaufland",
    "ALDI": "ALDI E-Commerce",
    "FIRMA HANDLOWA KABIS BOZENA KEDZIORA": "FIRMA HANDLOWA KABIS BOZENA KEDZIORA",
    "ZWECO UG": "Zweco UG"
  };
  

  const DEFAULT_KONTENRAHMEN = "1740 - Verbindlichkeiten";

  const formatDateForERP = (dateString?: string): string | undefined => {
    if (!dateString) return undefined;
    if (dateString.match(/^\d{4}-\d{2}-\d{2}$/)) {
        return dateString;
    }
    const datePartsDDMMYYYY = dateString.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
    if (datePartsDDMMYYYY && datePartsDDMMYYYY[3] && datePartsDDMMYYYY[2] && datePartsDDMMYYYY[1]) {
        return `${datePartsDDMMYYYY[3]}-${datePartsDDMMYYYY[2]}-${datePartsDDMMYYYY[1]}`;
    }
    try {
        const d = new Date(dateString);
        if (!isNaN(d.getTime())) {
             return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        }
    } catch (e) { /* ignore */ }
    return dateString; 
  };

  const calculateDueDate = (invoiceDateStr?: string, paymentTerm?: string): string | undefined => {
    if (!invoiceDateStr || !paymentTerm) return invoiceDateStr; 
    
    let invoiceDate: Date;
    try {
        invoiceDate = parseISO(invoiceDateStr); 
         if (isNaN(invoiceDate.getTime())) { 
            const parts = invoiceDateStr.match(/(\d{2})\.(\d{2})\.(\d{4})/);
            if (parts) {
                invoiceDate = parseISO(`${parts[3]}-${parts[2]}-${parts[1]}`);
            }
            if (isNaN(invoiceDate.getTime())) return invoiceDateStr;
         }
    } catch (e) {
        return invoiceDateStr; 
    }

    const termLower = paymentTerm.toLowerCase();

    if (termLower.includes("sofort") || termLower.includes("immediately")) {
      return invoiceDateStr;
    }

    const daysMatch = termLower.match(/(\d+)\s*tage/); 
    if (daysMatch && daysMatch[1]) {
      const days = parseInt(daysMatch[1], 10);
      if (!isNaN(days)) {
        const dueDate = addDays(invoiceDate, days);
        return `${dueDate.getFullYear()}-${String(dueDate.getMonth() + 1).padStart(2, '0')}-${String(dueDate.getDate()).padStart(2, '0')}`;
      }
    }
    return invoiceDateStr; 
  };


  const handleFilesSelected = useCallback((files: File[]) => {
    setSelectedFiles(files);
    setExtractedInvoices([]); 
    setErpProcessedInvoices([]);
    setStatus('idle');
    setErrorMessage(null);
    setProgressValue(0);
    setCurrentFileProgress('');
    localStorage.removeItem(LOCAL_STORAGE_PAGE_CACHE_KEY); 
    localStorage.removeItem(LOCAL_STORAGE_MATCHER_DATA_KEY);
  }, []);

  const resetStateOnModeChange = () => {
    const hasProcessedResults = extractedInvoices.length > 0 || erpProcessedInvoices.length > 0;

    if (hasProcessedResults) {
      setSelectedFiles([]); 
      setExtractedInvoices([]);
      setErpProcessedInvoices([]);
      localStorage.removeItem(LOCAL_STORAGE_MATCHER_DATA_KEY);
      localStorage.removeItem(LOCAL_STORAGE_PAGE_CACHE_KEY);
    }
    setStatus('idle');
    setCurrentFileProgress('');
    setProgressValue(0);
    setErrorMessage(null);
  }

  const handleProcessFiles = async () => {
    if (selectedFiles.length === 0) {
      setErrorMessage("No files selected. Please select PDF files to process.");
      setStatus('error');
      return;
    }

    setStatus('processing');
    setErrorMessage(null);
    setProgressValue(0);
    
    const allProcessedForMatcher: ERPIncomingInvoiceItem[] = [];
    const regularResultsDisplay: IncomingInvoiceItem[] = [];
    const erpResultsDisplay: ERPIncomingInvoiceItem[] = [];
    const yearCounters: Record<string, number> = {};


    try {
      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];
        setCurrentFileProgress(`Processing file ${i + 1} of ${selectedFiles.length}: ${file.name}`);
        
        const dataUri = await readFileAsDataURL(file);
        const aiResult: ExtractIncomingInvoiceDataOutput = await extractIncomingInvoiceData({ invoiceDataUri: dataUri }, {model: 'googleai/gemini-1.5-flash-latest'});
        
        let finalLieferantName = aiResult.lieferantName;

        if (aiResult.lieferantName) {
            const upperCaseLieferantName = aiResult.lieferantName.toUpperCase();
            if (supplierMap[upperCaseLieferantName]) { 
                finalLieferantName = supplierMap[upperCaseLieferantName];
            } else {
                const matchedValue = Object.values(supplierMap).find(val => val.toLowerCase() === aiResult.lieferantName?.toLowerCase());
                if (matchedValue) {
                    finalLieferantName = matchedValue;
                } else {
                    const foundKey = Object.keys(supplierMap).find(key => upperCaseLieferantName.includes(key.toUpperCase()));
                    if (foundKey) {
                        finalLieferantName = supplierMap[foundKey];
                    } else {
                        finalLieferantName = (aiResult.lieferantName === "UNBEKANNT" || !aiResult.lieferantName) ? "UNBEKANNT" : aiResult.lieferantName;
                    }
                }
            }
        } else {
            finalLieferantName = "UNBEKANNT";
        }


        const postingDateERP = formatDateForERP(aiResult.datum);
        const dueDateERP = calculateDueDate(postingDateERP, aiResult.zahlungsziel);
        
        let remarks = '';
        if (aiResult.kundenNummer) remarks += `Kunden-Nr.: ${aiResult.kundenNummer}`;
        if (aiResult.bestellNummer) remarks += `${remarks ? ' / ' : ''}Bestell-Nr.: ${aiResult.bestellNummer}`;

        let istBezahltStatus: 0 | 1 = 0;
        if (aiResult.isPaid === true) { 
          istBezahltStatus = 1;
        } else { 
            const zahlungszielLower = (aiResult.zahlungsziel || '').toLowerCase();
            const zahlungsartLower = (aiResult.zahlungsart || '').toLowerCase();
            if (zahlungszielLower.includes('sofort') || zahlungsartLower === 'sofort' || zahlungsartLower === 'lastschrift' || zahlungsartLower.includes('paypal') || zahlungsartLower.includes('paid')) {
              istBezahltStatus = 1;
            }
        }
        
        let yearToUse = new Date().getFullYear().toString();
        if (postingDateERP) { yearToUse = postingDateERP.substring(0,4); }
        if (!yearCounters[yearToUse]) { yearCounters[yearToUse] = 0; }
        yearCounters[yearToUse]++;
        const erpNextInvoiceNameGenerated = `ACC-PINV-${yearToUse}-${String(yearCounters[yearToUse]).padStart(5, '0')}`;

        const erpCompatibleInvoice: ERPIncomingInvoiceItem = {
          pdfFileName: file.name,
          rechnungsnummer: aiResult.rechnungsnummer,
          datum: postingDateERP, 
          lieferantName: finalLieferantName,
          lieferantAdresse: aiResult.lieferantAdresse,
          zahlungsziel: aiResult.zahlungsziel,
          zahlungsart: aiResult.zahlungsart,
          gesamtbetrag: aiResult.gesamtbetrag,
          mwstSatz: aiResult.mwstSatz,
          rechnungspositionen: aiResult.rechnungspositionen || [],
          kundenNummer: aiResult.kundenNummer,
          bestellNummer: aiResult.bestellNummer,
          isPaidByAI: aiResult.isPaid, 
          erpNextInvoiceName: erpNextInvoiceNameGenerated,
          billDate: postingDateERP,
          dueDate: dueDateERP,
          wahrung: 'EUR',
          istBezahlt: istBezahltStatus, 
          kontenrahmen: DEFAULT_KONTENRAHMEN,
          remarks: remarks.trim(),
        };
        allProcessedForMatcher.push(erpCompatibleInvoice);

        if (erpMode) {
          erpResultsDisplay.push(erpCompatibleInvoice);
        } else {
          regularResultsDisplay.push({
              pdfFileName: file.name,
              rechnungsnummer: aiResult.rechnungsnummer,
              datum: aiResult.datum, 
              lieferantName: aiResult.lieferantName, 
              lieferantAdresse: aiResult.lieferantAdresse,
              zahlungsziel: aiResult.zahlungsziel,
              zahlungsart: aiResult.zahlungsart,
              gesamtbetrag: aiResult.gesamtbetrag,
              mwstSatz: aiResult.mwstSatz,
              rechnungspositionen: aiResult.rechnungspositionen || [],
              kundenNummer: aiResult.kundenNummer,
              bestellNummer: aiResult.bestellNummer,
              isPaidByAI: aiResult.isPaid, 
          });
        }
        
        setProgressValue(Math.round(((i + 1) / selectedFiles.length) * 100));
      }
      
      setExtractedInvoices(regularResultsDisplay);
      setErpProcessedInvoices(erpResultsDisplay);
      
      localStorage.setItem(LOCAL_STORAGE_MATCHER_DATA_KEY, JSON.stringify(allProcessedForMatcher));
      setStatus('success'); 
      setCurrentFileProgress('Processing complete!');

    } catch (error) {
      console.error("Error processing files:", error);
      let message = 'An unexpected error occurred during processing.';
      if (error instanceof Error) {
        message = error.message;
      }
      setErrorMessage(message);
      setStatus('error');
      setCurrentFileProgress('Processing failed.');
    }
  };

  const handleExportToERPNext = async () => {
    console.log('[ExportERP] Starting export...');
    if (!erpMode || erpProcessedInvoices.length === 0) {
      toast({
        title: "No ERP Data",
        description: "No data available in ERP Vorlage Mode to export to ERPNext.",
        variant: "destructive",
      });
      return;
    }

    setIsExportingToERPNext(true);
    try {
      console.log('[ExportERP] Fetching API /api/erpnext/export-invoice...');
      const response = await fetch('/api/erpnext/export-invoice', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ invoices: erpProcessedInvoices }),
      });
      console.log('[ExportERP] Fetch response status:', response.status);

      if (!response.ok) {
        let detailedErrorMessage = `Server Error: ${response.status} ${response.statusText || ''}`.trim();
        console.log(`[ExportERP] Response not OK. Status: ${response.status}`);
        try {
          const errorResult = await response.json();
          console.log('[ExportERP] Error result (JSON):', errorResult);
          if (errorResult.error) {
            detailedErrorMessage = errorResult.error;
          } else if (errorResult.message) {
            detailedErrorMessage = errorResult.message;
          }
        } catch (jsonError) {
          console.log('[ExportERP] Failed to parse error as JSON:', jsonError);
          try {
            const textError = await response.text();
            console.log('[ExportERP] Error result (text):', textError);
            if (textError && textError.trim() !== '') {
              detailedErrorMessage = textError.substring(0, 250);
            }
          } catch (textParseError) {
            console.log('[ExportERP] Failed to parse error as text:', textParseError);
          }
        }
        toast({
          title: `Export Error (${response.status})`,
          description: detailedErrorMessage,
          variant: "destructive",
        });
        return; 
      }

      if (response.status === 204) {
        console.log('[ExportERP] Response 204 No Content.');
        toast({
          title: "Export Successful",
          description: "Invoices submitted to ERPNext (server returned no content).",
        });
      } else {
        const result = await response.json();
        console.log('[ExportERP] Response OK, result:', result);
        toast({
          title: "Export Successful",
          description: result.message || "Invoices submitted to ERPNext.",
        });
      }
    } catch (error: any) {
      console.error('[ExportERP] CATCH block error in handleExportToERPNext:', error);
      const message = error instanceof Error ? error.message : "Unknown error during ERPNext export.";
      toast({
        title: "ERPNext Export Failed",
        description: message,
        variant: "destructive",
      });
    } finally {
      console.log('[ExportERP] FINALLY block, setting isExportingToERPNext to false.');
      setIsExportingToERPNext(false);
    }
  };


  const displayInvoices = erpMode ? erpProcessedInvoices : extractedInvoices;

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
              <Switch
                id="erp-export-mode-switch"
                checked={useMinimalErpExport}
                onCheckedChange={setUseMinimalErpExport}
                disabled={status === 'processing'}
              />
              <Label htmlFor="erp-export-mode-switch" className="text-sm font-medium">
                Use Minimal ERP Export
              </Label>
              <FileCog className="h-5 w-5 text-muted-foreground" />
            </div>
          )}
        </div>


        {status === 'processing' && (
          <div className="my-6 p-4 border rounded-lg shadow-sm bg-card">
            <Progress value={progressValue} className="w-full mb-2" />
            <p className="text-sm text-center text-muted-foreground">{currentFileProgress}</p>
          </div>
        )}

        {errorMessage && (
          <Alert variant="destructive" className="my-6">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Processing Error</AlertTitle>
            <AlertDescription>{errorMessage}</AlertDescription>
          </Alert>
        )}
        
        {status === 'idle' && displayInvoices.length === 0 && selectedFiles.length === 0 && (
           <Alert className="my-6 bg-primary/5 border-primary/20">
            <Info className="h-4 w-4 text-primary" />
            <AlertTitle className="text-primary font-semibold">Get Started</AlertTitle>
            <AlertDescription className="text-primary/80">
              Upload one or more PDF files. Extracted details for each invoice will be shown below. Toggle ERP Vorlage Mode for ERPNext specific processing. Processed data is saved for the Bank Matcher.
            </AlertDescription>
          </Alert>
        )}

        {(status === 'success' || (status !== 'processing' && displayInvoices.length > 0)) && (
          <div className="mt-8 space-y-6">
            <IncomingInvoiceActionButtons 
              invoices={displayInvoices} 
              erpMode={erpMode}
              useMinimalErpExport={useMinimalErpExport}
              onExportToERPNext={handleExportToERPNext}
              isExportingToERPNext={isExportingToERPNext}
            />
            {erpMode ? (
              <ERPInvoiceTable invoices={erpProcessedInvoices} />
            ) : (
              (extractedInvoices.length > 0 ? extractedInvoices : displayInvoices as IncomingInvoiceItem[]).map((invoice, index) => (
                <IncomingInvoiceCard key={invoice.pdfFileName + '-' + index} invoice={invoice} />
              ))
            )}
          </div>
        )}

         {status === 'success' && displayInvoices.length === 0 && selectedFiles.length > 0 && (
           <Alert className="my-6">
            <Info className="h-4 w-4" />
            <AlertTitle>No Data Extracted</AlertTitle>
            <AlertDescription>
              Processing finished, but no invoice data could be extracted from the uploaded PDFs. Please check your files or try different ones.
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
    

    



