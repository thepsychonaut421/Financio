
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
import { addDays, parseISO, isValid, format as formatDateFns } from 'date-fns';
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
  'use client';
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
          // If cache is invalid or not 'success', clear it
          localStorage.removeItem(LOCAL_STORAGE_PAGE_CACHE_KEY);
        }
      }
    } catch (error) {
      console.error("Failed to load or parse incoming invoices page cache from localStorage:", error);
      localStorage.removeItem(LOCAL_STORAGE_PAGE_CACHE_KEY); // Clear on error
    }
  }, []);

  // Effect to save state to localStorage on successful processing
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
        // Optionally, you could add a toast notification here if saving fails
      }
    }
  }, [extractedInvoices, erpProcessedInvoices, erpMode, useMinimalErpExport, status]);
  
  const supplierMap: Record<string, string> = {
    // Keys are potential AI extractions (uppercase for robustness), values are EXACT ERPNext names
    "LIDL": "Lidl",
    "LIDL DIGITAL DEUTSCHLAND GMBH & CO. KG": "Lidl",
    "GD ARTLANDS ETRADING GMBH": "GD Artlands eTrading GmbH",
    "RETOURA": "RETOURA",
    "DOITBAU GMBH & CO.KG": "doitBau",
    "KAUFLAND": "Kaufland",
    "ALDI": "ALDI E-Commerce", // Assuming this is the ERPNext name
    "FIRMA HANDLOWA KABIS BOZENA KEDZIORA": "FIRMA HANDLOWA KABIS BOZENA KEDZIORA",
    "ZWECO UG": "Zweco UG",
    "FAVORIO C/O HATRACO GMBH": "Favorio c/o Hatraco GmbH",
    "HATRACO GMBH": "Hatraco GmbH",
    "CUMO GMBH": "CUMO GmbH",
    "SELLIXX GMBH": "SELLIXX GmbH",
    "UNBEKANNT": "UNBEKANNT_SUPPLIER_PLACEHOLDER", // Specific placeholder if "UNBEKANNT" from AI
  };
  
  // User should ensure this account exists in their ERPNext instance or update this default.
  const DEFAULT_KREDITOR_ACCOUNT = "1740 - Verbindlichkeiten"; // Will be made empty in CSV for "credit_to"

  const formatDateForERP = (dateString?: string): string | undefined => {
    if (!dateString || dateString.trim() === '') return undefined;

    // Check if already YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
        const d = parseISO(dateString); // Validate it
        return isValid(d) ? dateString : undefined;
    }
    // Try to parse common European formats DD.MM.YYYY or DD/MM/YYYY
    // and less common YYYY.MM.DD or YYYY/MM/DD
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
        const d = parseISO(isoDate); // Validate constructed date
        if (isValid(d)) return isoDate;
      }
    }
    
    // Fallback for other potential formats recognized by Date constructor (less reliable)
    try {
        const d = new Date(dateString);
        if (isValid(d)) {
             return formatDateFns(d, 'yyyy-MM-dd');
        }
    } catch (e) { /* ignore */ }
    
    console.warn(`Could not parse date "${dateString}" to YYYY-MM-DD for ERP. Returning undefined.`);
    return undefined; // Return undefined if no valid parsing occurs
  };

  const calculateDueDate = (invoiceDateStr?: string, paymentTerm?: string): string | undefined => {
    const erpInvoiceDate = formatDateForERP(invoiceDateStr); // Ensures we start with YYYY-MM-DD
    if (!erpInvoiceDate || !paymentTerm) return erpInvoiceDate; // Return posting date if no term or if posting date itself is invalid
    
    let invoiceDate: Date;
    try {
        invoiceDate = parseISO(erpInvoiceDate); // This should be safe as erpInvoiceDate is YYYY-MM-DD or undefined
         if (!isValid(invoiceDate)) { 
            // This case should ideally not be hit if formatDateForERP works correctly
            return erpInvoiceDate; // or undefined if erpInvoiceDate was undefined
         }
    } catch (e) {
        return erpInvoiceDate; // or undefined
    }

    const termLower = paymentTerm.toLowerCase();

    if (termLower.includes("sofort") || termLower.includes("immediately")) {
      return erpInvoiceDate;
    }

    const daysMatch = termLower.match(/(\d+)\s*tage/); // Looks for "XX Tage"
    if (daysMatch && daysMatch[1]) {
      const days = parseInt(daysMatch[1], 10);
      if (!isNaN(days)) {
        const dueDate = addDays(invoiceDate, days);
        return formatDateFns(dueDate, 'yyyy-MM-dd');
      }
    }
    // If no specific term is parsed, return the original posting date as due date.
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
    localStorage.removeItem(LOCAL_STORAGE_MATCHER_DATA_KEY); // Also clear matcher data as it's based on these invoices
  }, []);

  // Function to reset state when ERP mode or other toggles change, if there are processed results.
  const resetStateOnModeChange = () => {
    const hasProcessedResults = extractedInvoices.length > 0 || erpProcessedInvoices.length > 0;

    if (hasProcessedResults) {
      setSelectedFiles([]); // Clear selected files to prompt re-upload or re-process
      setExtractedInvoices([]);
      setErpProcessedInvoices([]);
      // Clear localStorage as the processing context has changed
      localStorage.removeItem(LOCAL_STORAGE_MATCHER_DATA_KEY);
      localStorage.removeItem(LOCAL_STORAGE_PAGE_CACHE_KEY);
    }
    // Reset common state regardless
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
    
    const allProcessedForMatcher: ERPIncomingInvoiceItem[] = []; // For Bank Matcher
    const regularResultsDisplay: IncomingInvoiceItem[] = []; // For standard display
    const erpResultsDisplay: ERPIncomingInvoiceItem[] = []; // For ERP Vorlage display
    const yearCounters: Record<string, number> = {}; // To generate unique erpNextInvoiceName


    try {
      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];
        setCurrentFileProgress(`Processing file ${i + 1} of ${selectedFiles.length}: ${file.name}`);
        
        const dataUri = await readFileAsDataURL(file);
        const aiResult: ExtractIncomingInvoiceDataOutput = await extractIncomingInvoiceData({ invoiceDataUri: dataUri });
        
        // Supplier Name Logic
        let finalLieferantName = (aiResult.lieferantName || "").trim();
        const upperCaseExtractedName = finalLieferantName.toUpperCase();
        if (supplierMap[upperCaseExtractedName]) {
            finalLieferantName = supplierMap[upperCaseExtractedName];
        } else if (finalLieferantName === "" || upperCaseExtractedName === "UNBEKANNT") {
            // If AI returns "UNBEKANNT" or empty, and it's not in the map, use a clear placeholder
            // This allows user to easily find and replace in CSV or update supplierMap
            finalLieferantName = "UNBEKANNT_SUPPLIER_AI_EXTRACTED"; 
        } // If not in map and not empty/UNBEKANNT, use the AI extracted name as is.


        const postingDateERP = formatDateForERP(aiResult.datum);
        const billDateERP = postingDateERP; // Bill date is often same as posting date for purchase invoices
        const dueDateERP = calculateDueDate(postingDateERP, aiResult.zahlungsziel);
        
        let remarks = '';
        if (aiResult.kundenNummer) remarks += `Kunden-Nr.: ${aiResult.kundenNummer}`;
        if (aiResult.bestellNummer) remarks += `${remarks ? ' / ' : ''}Bestell-Nr.: ${aiResult.bestellNummer}`;

        // Determine is_paid status (0 or 1)
        let istBezahltStatus: 0 | 1 = 0; // Default to not paid
        if (aiResult.isPaid === true) { // AI explicitly says paid
          istBezahltStatus = 1;
        } else { // AI doesn't say paid, try to infer from payment terms/method
            // Check common terms indicating immediate payment
            const zahlungszielLower = (aiResult.zahlungsziel || '').toLowerCase();
            const zahlungsartLower = (aiResult.zahlungsart || '').toLowerCase();
            if (zahlungszielLower.includes('sofort') || zahlungsartLower === 'sofort' || zahlungsartLower === 'lastschrift' || zahlungsartLower.includes('paypal') || zahlungsartLower.includes('paid')) {
              istBezahltStatus = 1;
            }
        }
        
        // Generate erpNextInvoiceName (for UI reference and potential CSV ID column)
        let yearToUse = new Date().getFullYear().toString(); // Default to current year
        if (postingDateERP) { // If we have a valid ERP posting date
            const parsedYear = postingDateERP.substring(0,4);
            if (!isNaN(parseInt(parsedYear))) yearToUse = parsedYear;
        } else if (aiResult.datum) { // Fallback to parsing original date if ERP date failed
            const parsedFallbackDate = new Date(aiResult.datum); // Attempt to parse whatever AI gave
            if(isValid(parsedFallbackDate)) yearToUse = parsedFallbackDate.getFullYear().toString();
        }

        if (!yearCounters[yearToUse]) { yearCounters[yearToUse] = 0; }
        yearCounters[yearToUse]++;
        const erpNextInvoiceNameGenerated = `ACC-PINV-${yearToUse}-${String(yearCounters[yearToUse]).padStart(5, '0')}`;
        
        // Use AI's rechnungsnummer if available, otherwise use the generated one as a fallback for processing
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
          isPaidByAI: aiResult.isPaid, // Store AI's original isPaid flag
          
          // ERP Specific fields
          erpNextInvoiceName: erpNextInvoiceNameGenerated, // For UI and potential CSV ID
          billDate: billDateERP,
          dueDate: dueDateERP,
          wahrung: 'EUR', // Default currency, can be made dynamic if AI extracts it
          istBezahlt: istBezahltStatus, // Final 0 or 1 status for ERP
          kontenrahmen: DEFAULT_KREDITOR_ACCOUNT, // To be made empty in CSV for 'credit_to'
          remarks: remarks.trim(),
        };
        allProcessedForMatcher.push(erpCompatibleInvoice); // For Bank Matcher

        if (erpMode) {
          erpResultsDisplay.push(erpCompatibleInvoice);
        } else {
          // For standard display, use more raw data from AI, but with normalized supplier name
          regularResultsDisplay.push({
              pdfFileName: file.name,
              rechnungsnummer: rechnungsnummerToUse, // Use consistent rechnungsnummer
              datum: aiResult.datum, // Show original date from AI for standard view
              lieferantName: finalLieferantName, // Use mapped/cleaned supplier name
              lieferantAdresse: aiResult.lieferantAdresse,
              zahlungsziel: aiResult.zahlungsziel,
              zahlungsart: aiResult.zahlungsart,
              gesamtbetrag: aiResult.gesamtbetrag,
              mwstSatz: aiResult.mwstSatz,
              rechnungspositionen: aiResult.rechnungspositionen || [],
              kundenNummer: aiResult.kundenNummer,
              bestellNummer: aiResult.bestellNummer,
              isPaidByAI: aiResult.isPaid, // Show AI's direct isPaid flag
          });
        }
        
        setProgressValue(Math.round(((i + 1) / selectedFiles.length) * 100));
      }
      
      setExtractedInvoices(regularResultsDisplay);
      setErpProcessedInvoices(erpResultsDisplay);
      
      // Save the data for Bank Matcher (always save ERP-formatted for consistency)
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
      // The API route '/api/erpnext/export-invoice' expects `ERPIncomingInvoiceItem[]`
      const response = await fetch('/api/erpnext/export-invoice', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ invoices: erpProcessedInvoices }), // Send the ERP-processed invoices
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
          // Ignore if error response is not JSON, use the status text
        }
        toast({
          title: `Export Error (${response.status})`,
          description: detailedErrorMessage,
          variant: "destructive",
        });
        return; // Stop further processing on error
      }

      // Handle different success scenarios (e.g., 204 No Content, or 200/207 with message)
      if (response.status === 204) { // No Content, usually means success but no body
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
            // Use default variant for 200 or 207 (partial success)
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
      // Network errors or other client-side issues
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

        {/* ERP Mode Toggle Section */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 p-4 bg-card border rounded-lg shadow-sm">
          <div className="flex items-center space-x-3">
            <Switch
              id="erp-mode-switch"
              checked={erpMode}
              onCheckedChange={(checked) => {
                setErpMode(checked);
                resetStateOnModeChange(); // Reset state if mode changes after processing
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


        {/* Progress Bar and Status Messages */}
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
        
        {/* Initial "Get Started" Message */}
        {status === 'idle' && displayInvoices.length === 0 && selectedFiles.length === 0 && (
           <Alert className="my-6 bg-primary/5 border-primary/20">
            <Info className="h-4 w-4 text-primary" />
            <AlertTitle className="text-primary font-semibold">Get Started</AlertTitle>
            <AlertDescription className="text-primary/80">
              Upload one or more PDF files. Extracted details for each invoice will be shown below. Toggle ERP Vorlage Mode for ERPNext specific processing. Processed data is saved for the Bank Matcher.
            </AlertDescription>
          </Alert>
        )}

        {/* Display Results Section */}
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
              // Ensure that if erpProcessedInvoices was populated (e.g. from cache) but erpMode is false, we show extractedInvoices
              (extractedInvoices.length > 0 ? extractedInvoices : displayInvoices as IncomingInvoiceItem[]).map((invoice, index) => (
                <IncomingInvoiceCard key={invoice.pdfFileName + '-' + index} invoice={invoice} />
              ))
            )}
          </div>
        )}

        {/* Message for "No Data Extracted" after successful processing */}
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

