
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
import { addDays, parseISO, isValid, format as formatDateFns } from 'date-fns'; // Added isValid and formatDateFns
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
    "ZWECO UG": "Zweco UG",
    "FAVORIO C/O HATRACO GMBH": "Favorio c/o Hatraco GmbH",
    "HATRACO GMBH": "Hatraco GmbH",
    "CUMO GMBH": "CUMO GmbH",
    "SELLIXX GMBH": "SELLIXX GmbH",
    // "UNBEKANNT" should map to a valid supplier in ERPNext if it's to be imported directly.
    // Otherwise, invoices with "UNBEKANNT" will cause an error or need manual handling.
    // For now, if AI extracts "UNBEKANNT", and it's not in the map, it will pass through.
    // If you have an "Unknown Supplier" record in ERPNext, map "UNBEKANNT" to that exact name.
  };
  
  const DEFAULT_KONTENRAHMEN = "1740 - Verbindlichkeiten"; 

  const formatDateForERP = (dateString?: string): string | undefined => {
    if (!dateString || dateString.trim() === '') return undefined;

    if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) { // Already YYYY-MM-DD
        const d = parseISO(dateString);
        return isValid(d) ? dateString : undefined;
    }
    const datePatterns = [
      { regex: /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/, dayIdx: 1, monthIdx: 2, yearIdx: 3 }, // DD.MM.YYYY
      { regex: /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/, dayIdx: 1, monthIdx: 2, yearIdx: 3 }, // DD/MM/YYYY
      { regex: /^(\d{4})\.(\d{1,2})\.(\d{1,2})$/, yearIdx: 1, monthIdx: 2, dayIdx: 3 }, // YYYY.MM.DD
      { regex: /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/, yearIdx: 1, monthIdx: 2, dayIdx: 3 }, // YYYY/MM/DD
    ];

    for (const pattern of datePatterns) {
      const match = dateString.match(pattern.regex);
      if (match) {
        const day = match[pattern.dayIdx].padStart(2, '0');
        const month = match[pattern.monthIdx].padStart(2, '0');
        const year = match[pattern.yearIdx];
        const isoDate = `${year}-${month}-${day}`;
        const d = parseISO(isoDate);
        if (isValid(d)) return isoDate;
      }
    }
    
    try { // Fallback to generic parsing
        const d = new Date(dateString);
        if (isValid(d)) {
             return formatDateFns(d, 'yyyy-MM-dd');
        }
    } catch (e) { /* ignore */ }
    
    console.warn(`Could not parse date "${dateString}" to YYYY-MM-DD. Returning undefined.`);
    return undefined; 
  };

  const calculateDueDate = (invoiceDateStr?: string, paymentTerm?: string): string | undefined => {
    const erpInvoiceDate = formatDateForERP(invoiceDateStr);
    if (!erpInvoiceDate || !paymentTerm) return erpInvoiceDate; 
    
    let invoiceDate: Date;
    try {
        invoiceDate = parseISO(erpInvoiceDate); 
         if (!isValid(invoiceDate)) { 
            return erpInvoiceDate;
         }
    } catch (e) {
        return erpInvoiceDate; 
    }

    const termLower = paymentTerm.toLowerCase();

    if (termLower.includes("sofort") || termLower.includes("immediately")) {
      return erpInvoiceDate;
    }

    const daysMatch = termLower.match(/(\d+)\s*tage/); 
    if (daysMatch && daysMatch[1]) {
      const days = parseInt(daysMatch[1], 10);
      if (!isNaN(days)) {
        const dueDate = addDays(invoiceDate, days);
        return formatDateFns(dueDate, 'yyyy-MM-dd');
      }
    }
    return erpInvoiceDate; 
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
        
        let finalLieferantName = aiResult.lieferantName?.trim() || "UNBEKANNT";
        const upperCaseExtractedName = finalLieferantName.toUpperCase();
        if (supplierMap[upperCaseExtractedName]) {
            finalLieferantName = supplierMap[upperCaseExtractedName];
        } else {
            // Fallback: if not in map, use the AI extracted name directly.
            // User must ensure this name exists in ERPNext or add it.
             if (finalLieferantName === "" || finalLieferantName.toUpperCase() === "UNBEKANNT") {
                 finalLieferantName = "UNBEKANNT_SUPPLIER"; // Placeholder if AI returns empty or 'UNBEKANNT' and it's not mapped
             }
        }


        const postingDateERP = formatDateForERP(aiResult.datum);
        const billDateERP = postingDateERP; 
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
        else if (aiResult.datum) { // Fallback if postingDateERP is undefined but aiResult.datum exists
            const parsedFallbackDate = new Date(aiResult.datum);
            if(isValid(parsedFallbackDate)) yearToUse = parsedFallbackDate.getFullYear().toString();
        }

        if (!yearCounters[yearToUse]) { yearCounters[yearToUse] = 0; }
        yearCounters[yearToUse]++;
        const erpNextInvoiceNameGenerated = `ACC-PINV-${yearToUse}-${String(yearCounters[yearToUse]).padStart(5, '0')}`;
        
        const rechnungsnummerToUse = aiResult.rechnungsnummer || erpNextInvoiceNameGenerated;

        const erpCompatibleInvoice: ERPIncomingInvoiceItem = {
          pdfFileName: file.name,
          rechnungsnummer: rechnungsnummerToUse,
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
          erpNextInvoiceName: erpNextInvoiceNameGenerated, // This is more like an internal reference or proposed ID
          billDate: billDateERP,
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
              rechnungsnummer: rechnungsnummerToUse, 
              datum: aiResult.datum, // Display original AI date in non-ERP mode
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
      const response = await fetch('/api/erpnext/export-invoice', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ invoices: erpProcessedInvoices }),
      });

      if (!response.ok) {
        let detailedErrorMessage = `Server Error: ${response.status} ${response.statusText || ''}`.trim();
        try {
          const errorResult = await response.json();
          if (errorResult.error) {
            detailedErrorMessage = errorResult.error;
          } else if (errorResult.message) {
            detailedErrorMessage = errorResult.message;
          }
        } catch (jsonError) {
          // Ignore if error response is not JSON
        }
        toast({
          title: `Export Error (${response.status})`,
          description: detailedErrorMessage,
          variant: "destructive",
        });
        return; 
      }

      if (response.status === 204) { 
        toast({
          title: "Export Submitted",
          description: "Invoices submitted to ERPNext (server returned no content, assuming success).",
        });
      } else {
        const result = await response.json();
        if (result.message) {
          toast({
            title: "Export Status",
            description: result.message,
            variant: response.status === 207 ? "default" : "default", 
          });
        } else {
           toast({
            title: "Export Submitted",
            description: "Invoices submitted to ERPNext.",
          });
        }
      }
    } catch (error: any) {
      const message = error instanceof Error ? error.message : "Unknown client-side error during ERPNext export.";
      toast({
        title: "ERPNext Export Failed",
        description: message,
        variant: "destructive",
      });
    } finally {
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

