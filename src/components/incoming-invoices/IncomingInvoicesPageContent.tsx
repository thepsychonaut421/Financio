
'use client';

import React, { useState, useCallback, useEffect, ChangeEvent, useMemo } from 'react';
import { IncomingInvoiceUploadForm } from '@/components/incoming-invoices/IncomingInvoiceUploadForm';
import { IncomingInvoiceCard } from '@/components/incoming-invoices/IncomingInvoiceCard';
import { ERPInvoiceTable } from '@/components/incoming-invoices/ERPInvoiceTable';
import { IncomingInvoiceActionButtons } from '@/components/incoming-invoices/IncomingInvoiceActionButtons';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle, Info, Settings2, FileCog, UploadCloud, CheckSquare } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { readFileAsDataURL } from '@/lib/file-helpers';
import { extractIncomingInvoiceData, type ExtractIncomingInvoiceDataOutput } from '@/ai/flows/extract-incoming-invoice-data';
import type { IncomingInvoiceItem, ERPIncomingInvoiceItem, IncomingProcessingStatus, ERPSortKey, SortOrder } from '@/types/incoming-invoice';
import { addDays, parseISO, isValid, format as formatDateFns } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { erpInvoicesToSupplierCSV, downloadFile, incomingInvoicesToERPNextCSVComplete } from '@/lib/export-helpers';
import JSZip from 'jszip';
import Papa from 'papaparse';


const LOCAL_STORAGE_PAGE_CACHE_KEY = 'incomingInvoicesPageCache';
const LOCAL_STORAGE_MATCHER_DATA_KEY = 'processedIncomingInvoicesForMatcher';

interface DiscrepancyError {
    filename: string;
    reason: string;
}

interface AIInvoice {
  supplier: string | null;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  dueDate: string | null;
  nettoBetrag: number | null;
  mwstBetrag: number | null;
  bruttoBetrag: number | null;
  currency: string | null;
  items: Array<{
    description: string | null;
    quantity: number | null;
    unitPrice: number | null;
    totalPrice: number | null;
  }>;
}

function validateTotals(data: AIInvoice) {
  const { nettoBetrag, mwstBetrag, bruttoBetrag } = data;
  if (nettoBetrag == null || mwstBetrag == null || bruttoBetrag == null) {
    return { valid: false, reason: 'One or more amounts missing' };
  }
  const sum = parseFloat((nettoBetrag + mwstBetrag).toFixed(2));
  if (sum !== parseFloat(bruttoBetrag.toFixed(2))) {
    return {
      valid: false,
      reason: `Netto (${nettoBetrag}) + MwSt (${mwstBetrag}) = ${sum}, but Brutto is ${bruttoBetrag}`
    };
  }
  return { valid: true, reason: '' };
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
    return text
        .replace(/Ã¼/g, 'ü').replace(/Ã¤/g, 'ä').replace(/Ã¶/g, 'ö').replace(/Ã/g, 'ß') // Common encoding errors
        .replace(/[\uFFFD]/g, '') // Remove replacement character
        .trim();
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
  
  const getERPNextSupplierName = (extractedName: string | null): string => {
    if (!extractedName) return "UNBEKANNT_SUPPLIER_PLACEHOLDER";
    const nameUpper = extractedName.toUpperCase();
    // This logic is now deterministic in code, not in the AI prompt.
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
      "SELLIX": "SELLIXX GmbH",
    };

    for (const key in supplierMap) {
        if (nameUpper.includes(key)) {
            return supplierMap[key];
        }
    }
    
    if (nameUpper === "UNBEKANNT" || nameUpper === "UNBEKANNT_SUPPLIER_AI_EXTRACTED") {
      return "UNBEKANNT_SUPPLIER_PLACEHOLDER";
    }

    return extractedName;
  };
  

  const formatDateForERP = (dateString?: string | null): string | undefined => {
    if (!dateString || dateString.trim() === '') return undefined;
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) { 
        const d = parseISO(dateString); 
        return isValid(d) ? dateString : undefined;
    }
    const datePatterns = [
      { regex: /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/, dayIdx: 1, monthIdx: 2, yearIdx: 3 }, 
      { regex: /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/, dayIdx: 1, monthIdx: 2, yearIdx: 3 }, 
      { regex: /^(\d{4})\.(\d{1,2})\.(\d{1,2})$/, yearIdx: 1, monthIdx: 2, dayIdx: 3 }, 
      { regex: /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/, yearIdx: 1, monthIdx: 2, dayIdx: 3 }, 
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
    
    try {
        const d = new Date(dateString);
        if (isValid(d)) {
          const year = d.getFullYear();
          if (year > 1900 && year < 2100) {
            return formatDateFns(d, 'yyyy-MM-dd');
          }
        }
    } catch (e) { /* ignore error from new Date() */ }

    console.warn(`Could not parse date "${dateString}" to YYYY-MM-DD for ERP. Returning undefined.`);
    return undefined; 
  };

  const calculateDueDate = (invoiceDateStr?: string, paymentTerm?: string): string | undefined => {
    const erpInvoiceDate = formatDateForERP(invoiceDateStr);
    if (!erpInvoiceDate || !paymentTerm) return erpInvoiceDate; 
    let invoiceDate: Date;
    try {
        invoiceDate = parseISO(erpInvoiceDate);
         if (!isValid(invoiceDate)) return erpInvoiceDate; 
    } catch (e) { return erpInvoiceDate; } 

    const termLower = paymentTerm.toLowerCase();
    if (termLower.includes("sofort") || termLower.includes("immediately")) return erpInvoiceDate;

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
    setStatus('processing');
    setErrorMessage(null);
    setDiscrepancyErrors([]);
    setProgressValue(0);
    
    const allProcessedForMatcher: ERPIncomingInvoiceItem[] = [];
    const regularResultsDisplay: IncomingInvoiceItem[] = [];
    const erpResultsDisplay: ERPIncomingInvoiceItem[] = [];
    const yearCounters: Record<string, number> = {};
    const localDiscrepancyErrors: DiscrepancyError[] = [];
    const filesWithErrors: string[] = [];

    try {
      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];
        setCurrentFileProgress(`Processing file ${i + 1} of ${selectedFiles.length}: ${file.name}`);
        
        const dataUri = await readFileAsDataURL(file);
        const aiResult: ExtractIncomingInvoiceDataOutput = await extractIncomingInvoiceData({ invoiceDataUri: dataUri });
        
        if (aiResult.error) {
          filesWithErrors.push(`${file.name}: ${aiResult.error}`);
          setProgressValue(Math.round(((i + 1) / selectedFiles.length) * 100));
          continue;
        }

        const validation = validateTotals(aiResult as AIInvoice);
        if (!validation.valid) {
            localDiscrepancyErrors.push({ filename: file.name, reason: validation.reason || 'Unknown discrepancy' });
        }


        const finalLieferantName = getERPNextSupplierName(aiResult.lieferantName || 'UNBEKANNT');
        
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
        if (postingDateERP) {
            const parsedYear = postingDateERP.substring(0,4);
            if (!isNaN(parseInt(parsedYear))) yearToUse = parsedYear;
        } else if (aiResult.datum) { 
            try {
              const parsedFallbackDate = new Date(aiResult.datum); 
              if(isValid(parsedFallbackDate)) yearToUse = parsedFallbackDate.getFullYear().toString();
            } catch (e) { /* ignore */ }
        }
        
        if (!yearCounters[yearToUse]) { yearCounters[yearToUse] = 0; }
        yearCounters[yearToUse]++;
        const internalRefId = `INTERNAL-${yearToUse}-${String(yearCounters[yearToUse]).padStart(5, '0')}`;
        const rechnungsnummerToUse = aiResult.rechnungsnummer || internalRefId;

        const erpCompatibleInvoice: ERPIncomingInvoiceItem = {
          pdfFileName: file.name,
          rechnungsnummer: sanitizeText(rechnungsnummerToUse),
          datum: postingDateERP, 
          lieferantName: sanitizeText(finalLieferantName),
          lieferantAdresse: sanitizeText(aiResult.lieferantAdresse),
          zahlungsziel: sanitizeText(aiResult.zahlungsziel),
          zahlungsart: sanitizeText(aiResult.zahlungsart),
          gesamtbetrag: aiResult.gesamtbetrag,
          mwstSatz: sanitizeText(aiResult.mwstSatz),
          rechnungspositionen: (aiResult.rechnungspositionen || []).map(item => ({
              ...item,
              productCode: sanitizeText(item.productCode),
              productName: sanitizeText(item.productName),
          })),
          kundenNummer: sanitizeText(aiResult.kundenNummer),
          bestellNummer: sanitizeText(aiResult.bestellNummer),
          isPaidByAI: aiResult.isPaid,
          erpNextInvoiceName: sanitizeText(internalRefId), 
          billDate: billDateERP, 
          dueDate: dueDateERP,   
          wahrung: aiResult.waehrung || 'EUR', 
          istBezahlt: istBezahltStatus, 
          kontenrahmen: sanitizeText(kontenrahmen), 
          remarks: sanitizeText(remarks),
          nettoBetrag: aiResult.nettoBetrag,
          mwstBetrag: aiResult.mwstBetrag,
        };
        allProcessedForMatcher.push(erpCompatibleInvoice);

        if (erpMode) {
          erpResultsDisplay.push(erpCompatibleInvoice);
        } else {
          regularResultsDisplay.push({
              pdfFileName: file.name,
              rechnungsnummer: sanitizeText(rechnungsnummerToUse),
              datum: sanitizeText(aiResult.datum), 
              lieferantName: sanitizeText(finalLieferantName),
              lieferantAdresse: sanitizeText(aiResult.lieferantAdresse),
              zahlungsziel: sanitizeText(aiResult.zahlungsziel),
              zahlungsart: sanitizeText(aiResult.zahlungsart),
              gesamtbetrag: aiResult.gesamtbetrag,
              mwstSatz: sanitizeText(aiResult.mwstSatz),
              rechnungspositionen: (aiResult.rechnungspositionen || []).map(item => ({
                  ...item,
                  productCode: sanitizeText(item.productCode),
                  productName: sanitizeText(item.productName),
              })),
              kundenNummer: sanitizeText(aiResult.kundenNummer),
              bestellNummer: sanitizeText(aiResult.bestellNummer),
              isPaidByAI: aiResult.isPaid,
              nettoBetrag: aiResult.nettoBetrag,
              mwstBetrag: aiResult.mwstBetrag,
          });
        }
        setProgressValue(Math.round(((i + 1) / selectedFiles.length) * 100));
      }

      setExtractedInvoices(regularResultsDisplay);
      setErpProcessedInvoices(erpResultsDisplay);
      setDiscrepancyErrors(localDiscrepancyErrors);
      localStorage.setItem(LOCAL_STORAGE_MATCHER_DATA_KEY, JSON.stringify(allProcessedForMatcher));
      
      if (filesWithErrors.length > 0) {
        setErrorMessage(`Processing summary: ${selectedFiles.length - filesWithErrors.length} of ${selectedFiles.length} files succeeded. Errors occurred on: ${filesWithErrors.join('; ')}`);
        setStatus(regularResultsDisplay.length > 0 || erpResultsDisplay.length > 0 ? 'success' : 'error');
      } else {
        setStatus('success'); 
      }
      
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
      const response = await fetch('/api/erpnext/export-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoices: invoicesToExport }),
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

  const handleErpExportFileChange = (event: ChangeEvent<HTMLInputElement>) => {
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
        const headers = (results.meta.fields || []).map(h => h.toLowerCase().trim());
        
        const supplierColVariations = ["supplier", "supplier name", "lieferant", "lieferantenname", "supplier_name"];
        const billNoColVariations = ["bill no", "bill_no", "invoice no", "invoice_no", "rechnungsnummer", "name", "id"]; 
        const dateColVariations = ["posting date", "posting_date", "invoice date", "invoice_date", "rechnungsdatum", "datum", "bill date", "bill_date"];

        let actualSupplierCol = headers.find(h => supplierColVariations.includes(h));
        let actualBillNoCol = headers.find(h => billNoColVariations.includes(h));
        let actualDateCol = headers.find(h => dateColVariations.includes(h));
        
        if (!actualSupplierCol || !actualBillNoCol || !actualDateCol) {
            const missing = [
                !actualSupplierCol ? "Supplier" : null,
                !actualBillNoCol ? "Invoice Number" : null,
                !actualDateCol ? "Invoice Date" : null
            ].filter(Boolean).join(', ');
            setErrorMessage(`Could not find required columns in ERPNext export: ${missing}. Found headers: ${(results.meta.fields || []).join(', ')}`);
            setIsCheckingDuplicates(false);
            setExistingErpInvoiceKeys(new Set()); 
            return;
        }
        
        // Get original case headers for data access
        const originalHeaders = results.meta.fields!;
        const supplierHeader = originalHeaders[headers.indexOf(actualSupplierCol)];
        const billNoHeader = originalHeaders[headers.indexOf(actualBillNoCol)];
        const dateHeader = originalHeaders[headers.indexOf(actualDateCol)];


        results.data.forEach((row: any) => {
          const rawSupplierNameFromErp = (row[supplierHeader] || '').trim();
          let normalizedSupplierNameForErpKey = getERPNextSupplierName(rawSupplierNameFromErp).toLowerCase();
          
          const invoiceNumberFromErp = (row[billNoHeader] || '').trim().toLowerCase();
          const rawDateFromErp = (row[dateHeader] || '').trim();
          const parsedAndFormattedDate = formatDateForERP(rawDateFromErp); 

          if (normalizedSupplierNameForErpKey && invoiceNumberFromErp && parsedAndFormattedDate) {
            const key = `${normalizedSupplierNameForErpKey}||${invoiceNumberFromErp}||${parsedAndFormattedDate}`;
            newKeys.add(key);
          } else {
            // console.warn("Skipping row for ERP key generation due to missing supplier, invoice number, or unparsable date:", row);
          }
        });

        setExistingErpInvoiceKeys(newKeys);
        toast({
          title: "ERPNext Data Processed",
          description: `Found ${newKeys.size} unique invoice keys (Supplier + Number + Date) from your ERPNext export.`,
        });
        setIsCheckingDuplicates(false);
        setStatus(prev => prev === 'idle' && (extractedInvoices.length > 0 || erpProcessedInvoices.length > 0) ? 'success' : prev);

      },
      error: (error: Error) => {
        console.error("Error parsing ERPNext export CSV:", error);
        setErrorMessage(`Error parsing ERPNext export: ${error.message}`);
        setExistingErpInvoiceKeys(new Set()); 
        setIsCheckingDuplicates(false);
      }
    });
  };
  
  const createInvoiceKey = (invoice: ERPIncomingInvoiceItem | IncomingInvoiceItem): string => {
    let dateToUse: string | undefined;
    if ('datum' in invoice && invoice.datum) { // ERPIncomingInvoiceItem or IncomingInvoiceItem with YYYY-MM-DD
        dateToUse = invoice.datum;
    } else if ('datum' in invoice) { // IncomingInvoiceItem with potentially other date format
        dateToUse = formatDateForERP(invoice.datum);
    }
    
    const supplier = (invoice.lieferantName || '').trim().toLowerCase(); 
    const number = (invoice.rechnungsnummer || '').trim().toLowerCase();
    
    return `${supplier}||${number}||${dateToUse || 'NO_DATE'}`; 
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
    setErpSortKey('datum'); // Reset sort
    setErpSortOrder('desc');

    localStorage.removeItem(LOCAL_STORAGE_PAGE_CACHE_KEY);
    localStorage.removeItem(LOCAL_STORAGE_MATCHER_DATA_KEY);

    toast({
      title: "Invoices Cleared",
      description: "All processed invoices, selected files, and duplicate check data have been cleared.",
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
            <CardDescription>Upload a CSV export from ERPNext (containing Supplier, Invoice No, and Date) to flag invoices possibly already in your system.</CardDescription>
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
                className="mt-1 block w-full text-sm text-slate-500
                  file:mr-4 file:py-2 file:px-4
                  file:rounded-full file:border-0
                  file:text-sm file:font-semibold
                  file:bg-primary/10 file:text-primary
                  hover:file:bg-primary/20"
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
                Configure default values for ERPNext exports. This value will be saved for your next session.
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
              Upload one or more PDF files. Extracted details for each invoice will be shown below. Toggle ERP Vorlage Mode for ERPNext specific processing. Processed data is saved for the Bank Matcher. You can also upload an ERPNext CSV export to check for duplicates.
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

    