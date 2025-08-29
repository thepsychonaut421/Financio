
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


const CACHE_VERSION = 'v2';
const LOCAL_STORAGE_PAGE_CACHE_KEY = `incomingInvoicesPageCache:${CACHE_VERSION}`;
const LOCAL_STORAGE_MATCHER_DATA_KEY = 'processedIncomingInvoicesForMatcher';

interface IncomingInvoicesPageCache {
  extractedInvoices: IncomingInvoiceItem[];
  erpProcessedInvoices: ERPIncomingInvoiceItem[];
  erpMode: boolean;
  status: IncomingProcessingStatus;
  existingErpInvoiceKeys?: string[];
  erpSortKey?: ERPSortKey | null;
  erpSortOrder?: SortOrder;
  kontenrahmen?: string;
  processedFileFingerprints?: { [key: string]: string }; // Now a map of fingerprint to pdfFileName
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

const getFileFingerprint = (file: File): string => {
    return `${file.name}-${file.size}-${file.lastModified}`;
};

function cap<T>(arr: T[], max = 200) {
  return Array.isArray(arr) && arr.length > max ? arr.slice(0, max) : arr;
}

function findCachedInvoiceByFilename(name: string, erpMode: boolean) {
  try {
    const cachedStr = localStorage.getItem(LOCAL_STORAGE_PAGE_CACHE_KEY);
    if (!cachedStr) return null;
    const cached = JSON.parse(cachedStr) as IncomingInvoicesPageCache;
    const list = erpMode ? cached.erpProcessedInvoices : cached.extractedInvoices;
    return Array.isArray(list) ? list.find(inv => inv.pdfFileName === name) : null;
  } catch { return null; }
}

function enforceErpSchemaSafety<T extends Record<string, any>>(x: T, filename: string): T {
  const today = new Date().toISOString().slice(0,10);
  x.doctype = 'Purchase Invoice';
  x.posting_date ||= x.datum || today;
  x.bill_date ||= x.posting_date;
  x.currency ||= x.wahrung || 'EUR';

  if (!Array.isArray(x.rechnungspositionen) || x.rechnungspositionen.length === 0) {
    x.rechnungspositionen = [{
      productName: 'UNKNOWN ITEM',
      quantity: 1,
      unitPrice: 0,
      total: 0,
      uom: 'Nos'
    }];
    x.anomalies = Array.from(new Set([...(x.anomalies||[]), 'NO_ITEMS_EXTRACTED']));
  }

  x.custom_fields = {
    ...(x.custom_fields || {}),
    _source_filename: filename,
    _extraction_confidence: x.extraction_confidence ?? null,
  };
  return x;
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
  const [isExportingToERPNext, setIsExportingToERPNext] = useState(false);
  const [isExportingSuppliers, setIsExportingSuppliers] = useState(false);
  const [isSubmittingItems, setIsSubmittingItems] = useState(false);
  const [isExportingZip, setIsExportingZip] = useState(false);
  const { toast } = useToast();
  const [currentYear, setCurrentYear] = useState<string>('');
  const [kontenrahmen, setKontenrahmen] = useState('20000 - Verbindlichkeiten Lief Inland');
  const [processedFileFingerprints, setProcessedFileFingerprints] =
  useState<Record<string, string>>({});


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
      if (!cachedDataString) {
        return;
      }
  
      const parsedJson = JSON.parse(cachedDataString) as Partial<IncomingInvoicesPageCache>;
  
      if (parsedJson && typeof parsedJson === 'object' && 'status' in parsedJson) {
        setExtractedInvoices(Array.isArray(parsedJson.extractedInvoices) ? parsedJson.extractedInvoices : []);
        setErpProcessedInvoices(Array.isArray(parsedJson.erpProcessedInvoices) ? parsedJson.erpProcessedInvoices : []);
        setErpMode(typeof parsedJson.erpMode === 'boolean' ? parsedJson.erpMode : false);
        setKontenrahmen(parsedJson.kontenrahmen || '20000 - Verbindlichkeiten Lief Inland');
  
        if (Array.isArray(parsedJson.existingErpInvoiceKeys)) {
          setExistingErpInvoiceKeys(new Set(parsedJson.existingErpInvoiceKeys));
        }
  
        setErpSortKey((parsedJson.erpSortKey as any) || 'datum');
        setErpSortOrder((parsedJson.erpSortOrder as any) || 'desc');
        setProcessedFileFingerprints(parsedJson.processedFileFingerprints || {});
  
        const hasAny =
          (parsedJson.extractedInvoices && parsedJson.extractedInvoices.length > 0) ||
          (parsedJson.erpProcessedInvoices && parsedJson.erpProcessedInvoices.length > 0) ||
          (parsedJson.existingErpInvoiceKeys && parsedJson.existingErpInvoiceKeys.length > 0);
  
        setStatus(hasAny ? (parsedJson.status as any) : 'idle');
      } else {
        localStorage.removeItem(LOCAL_STORAGE_PAGE_CACHE_KEY);
      }
    } catch (error) {
      console.error('Failed to load or parse incoming invoices page cache from localStorage:', error);
      localStorage.removeItem(LOCAL_STORAGE_PAGE_CACHE_KEY);
    }
  }, []);

  useEffect(() => {
    const v = localStorage.getItem('financio:kontenrahmen');
    if (v) setKontenrahmen(v);
  }, []);
  
  useEffect(() => {
    localStorage.setItem('financio:kontenrahmen', kontenrahmen);
  }, [kontenrahmen]);

  useEffect(() => {
    if (status !== 'processing' && status !== 'idle') {
      try {
        const cacheToSave: IncomingInvoicesPageCache = {
          extractedInvoices: cap(extractedInvoices),
          erpProcessedInvoices: cap(erpProcessedInvoices),
          erpMode,
          status,
          existingErpInvoiceKeys: Array.from(existingErpInvoiceKeys),
          erpSortKey,
          erpSortOrder,
          kontenrahmen,
          processedFileFingerprints,
        };
        localStorage.setItem(
          LOCAL_STORAGE_PAGE_CACHE_KEY,
          JSON.stringify(cacheToSave)
        );
      } catch (err) {
        console.error('Failed to save incoming invoices page cache:', err);
      }
    }
  }, [
    extractedInvoices,
    erpProcessedInvoices,
    erpMode,
    status,
    existingErpInvoiceKeys,
    erpSortKey,
    erpSortOrder,
    kontenrahmen,
    processedFileFingerprints,
  ]);
  
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
    "UNBEKANNT": "UNBEKANNT_SUPPLIER_PLACEHOLDER", 
    "UNBEKANNT_SUPPLIER_AI_EXTRACTED": "UNBEKANNT_SUPPLIER_PLACEHOLDER",
  };
  

  const formatDateForERP = (dateString?: string): string | undefined => {
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
  }, []);


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

    const currentRegularInvoices = [...extractedInvoices];
    const currentErpInvoices = [...erpProcessedInvoices];
    const currentMatcherInvoices = JSON.parse(localStorage.getItem(LOCAL_STORAGE_MATCHER_DATA_KEY) || '[]');
    const newFingerprints = { ...processedFileFingerprints };
    const duplicates: string[] = [];

    const filesToProcess = selectedFiles.filter(file => {
      const fingerprint = getFileFingerprint(file);
      if (newFingerprints[fingerprint]) {
        duplicates.push(file.name);
        
        const existsInUi = (erpMode ? currentErpInvoices : currentRegularInvoices)
          .some(inv => inv.pdfFileName === file.name);
        
        if (!existsInUi) {
          const cached = findCachedInvoiceByFilename(file.name, erpMode);
          if (cached) {
            if (erpMode) currentErpInvoices.unshift(cached as ERPIncomingInvoiceItem);
            else currentRegularInvoices.unshift(cached as any);
          }
        }
        
        return false;
      }
      return true;
    });

    if (duplicates.length > 0) {
        toast({
            title: "Duplicate Files Skipped",
            description: `${duplicates.length} file(s) already processed; restored in list if missing: ${duplicates.join(', ')}`,
            variant: "default",
        });
    }

    if (filesToProcess.length === 0) {
        setStatus('success');
        setCurrentFileProgress('No new files to process. Duplicates were skipped.');
        return;
    }

    const yearCounters: Record<string, number> = {};
    let accumulatedErrors: string[] = [];


    try {
      for (let i = 0; i < filesToProcess.length; i++) {
        const file = filesToProcess[i];
        setCurrentFileProgress(`Processing file ${i + 1} of ${filesToProcess.length}: ${file.name}`);
        
        const dataUri = await readFileAsDataURL(file);
        let aiResult: ExtractIncomingInvoiceDataOutput = await extractIncomingInvoiceData({ invoiceDataUri: dataUri });
        
        aiResult = enforceErpSchemaSafety(aiResult as any, file.name);

        const fingerprint = getFileFingerprint(file);
        newFingerprints[fingerprint] = file.name;

        if (aiResult.error) {
          accumulatedErrors.push(`${file.name}: ${aiResult.error}`);
          setProgressValue(Math.round(((i + 1) / filesToProcess.length) * 100));
          continue;
        }

        let finalLieferantName = (aiResult.lieferantName || "").trim();
        const upperCaseExtractedName = finalLieferantName.toUpperCase();

        if (supplierMap[upperCaseExtractedName]) {
            finalLieferantName = supplierMap[upperCaseExtractedName];
        } else if (finalLieferantName === "" || finalLieferantName === "UNBEKANNT" || finalLieferantName === "UNBEKANNT_SUPPLIER_AI_EXTRACTED") {
            finalLieferantName = "UNBEKANNT_SUPPLIER_PLACEHOLDER"; 
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
          erpNextInvoiceName: internalRefId, 
          billDate: billDateERP, 
          dueDate: dueDateERP,   
          wahrung: 'EUR', 
          istBezahlt: istBezahltStatus, 
          kontenrahmen: kontenrahmen.trim(), 
          remarks: remarks.trim(),
        };
        currentMatcherInvoices.push(erpCompatibleInvoice);

        if (erpMode) {
          currentErpInvoices.push(erpCompatibleInvoice);
        } else {
          currentRegularInvoices.push({
              pdfFileName: file.name,
              rechnungsnummer: rechnungsnummerToUse,
              datum: aiResult.datum, 
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
        setProgressValue(Math.round(((i + 1) / filesToProcess.length) * 100));
      }

      setExtractedInvoices(currentRegularInvoices);
      setErpProcessedInvoices(currentErpInvoices);
      setProcessedFileFingerprints(newFingerprints);
      
      localStorage.setItem(LOCAL_STORAGE_MATCHER_DATA_KEY, JSON.stringify(currentMatcherInvoices));
      
      if (accumulatedErrors.length > 0) {
        setErrorMessage(accumulatedErrors.join('\n'));
        setStatus('success');
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
      const response = await fetch('/api/erpnext/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoices: invoicesToExport }),
      });

      const result = await response.json();

      if (!response.ok) {
        toast({ title: `Export Error (${response.status})`, description: result.error || result.message || "An unknown server error occurred.", variant: "destructive" });
        return;
      }
      
      toast({ title: "Export Status", description: result.message || "Invoices submitted successfully.", variant: response.status === 207 ? "default" : "default" });

    } catch (error: any) {
      const message = error instanceof Error ? error.message : "Unknown client-side error during ERPNext export.";
      toast({ title: "ERPNext Export Failed", description: message, variant: "destructive" });
    } finally {
      setIsExportingToERPNext(false);
    }
  };

  const handleExportSuppliersERPNext = async () => {
    const invoicesToUse = erpMode ? sortedErpProcessedInvoices : erpProcessedInvoices;
    if (invoicesToUse.length === 0) {
        toast({
            title: "No Data for Suppliers",
            description: "No processed invoice data in ERP Mode to extract suppliers from.",
            variant: "destructive",
        });
        return;
    }

    const uniqueSuppliersMap = new Map<string, ERPIncomingInvoiceItem>();
    invoicesToUse.forEach(invoice => {
        const supplierKey = (invoice.lieferantName || '').trim().toUpperCase();
        if (supplierKey && supplierKey !== "UNBEKANNT_SUPPLIER_PLACEHOLDER" && supplierKey !== "UNBEKANNT") {
            if (!uniqueSuppliersMap.has(supplierKey)) {
                uniqueSuppliersMap.set(supplierKey, invoice);
            }
        }
    });

    const supplierPayloads = Array.from(uniqueSuppliersMap.values()).map(invoice => ({
        name: invoice.lieferantName,
        type: "Unternehmen",
        group: "All Suppliers",
        country: "Deutschland",
        address: {
            line1: invoice.lieferantAdresse,
        }
    }));


    if (supplierPayloads.length === 0) {
        toast({ title: "No New Suppliers", description: "No unique suppliers found to export." });
        return;
    }

    setIsExportingSuppliers(true);
    try {
        const response = await fetch('/api/erpnext/suppliers', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ suppliers: supplierPayloads }),
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || result.message || "An unknown server error occurred.");
        }
        
        const feedbackLines = (result.results || []).map((r:any) => r.ok ? `✅ ${r.name} (${r.status})` : `❌ ${r.name} — ${r.error}`).join("\n");
        toast({
            title: `Suppliers API: ${result.succeeded}/${result.total} succeeded`,
            description: <pre className="mt-2 w-full max-w-sm rounded-md bg-slate-950 p-4 whitespace-pre-wrap"><code className="text-white">{feedbackLines}</code></pre>,
        });

    } catch (error: any) {
        toast({ title: "Supplier Export Failed", description: error.message, variant: "destructive" });
    } finally {
      setIsExportingSuppliers(false);
    }
  };

  const handleExportSuppliersCSV = async () => {
    const invoicesToUse = erpMode ? sortedErpProcessedInvoices : erpProcessedInvoices;
    if (invoicesToUse.length === 0) {
      toast({ title: "No Data", description: "No processed ERP data to export suppliers from.", variant: "destructive" });
      return;
    }
    
    try {
      const response = await fetch('/api/csv/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          doctype: 'Supplier',
          payload: invoicesToUse,
          filename: 'erpnext_suppliers.csv'
        }),
      });

      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || 'Failed to generate CSV on server.');
      }
      
      const blob = await response.blob();
      downloadFile(blob, 'erpnext_suppliers.csv', 'text/csv;charset=utf-8');
      toast({ title: "Suppliers Exported", description: "Supplier data has been exported to CSV." });

    } catch (error: any) {
       toast({ title: "Export Failed", description: error.message, variant: "destructive" });
    }
  };

    const handleSubmitItemsAPI = async () => {
      const invoicesToUse = erpMode ? sortedErpProcessedInvoices : erpProcessedInvoices;
      if (invoicesToUse.length === 0) {
        toast({ title: 'No Invoices', description: 'No processed invoices to submit items from.', variant: 'destructive'});
        return;
      }

      const itemsPayload = invoicesToUse
        .flatMap(inv => inv.rechnungspositionen || [])
        .map(item => ({
            item_code: item.productCode || item.productName,
            item_name: item.productName || item.productCode,
            stock_uom: 'Stk',
        }))
        .filter(item => item.item_code);

        const uniqueItems = Array.from(new Map(itemsPayload.map(item => [item.item_code, item])).values());


      if(uniqueItems.length === 0) {
        toast({ title: 'No Items', description: 'No valid items with product codes found to submit.', variant: 'destructive'});
        return;
      }

      setIsSubmittingItems(true);
      try {
        const response = await fetch('/api/erpnext/items', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: uniqueItems }),
        });
        if (!response.ok) {
          const result = await response.json();
          throw new Error(result.error || 'Failed to submit items');
        }
        const result = await response.json();
        const feedbackLines = (result.results || []).map((r:any) => r.success ? `✅ ${r.data?.item_code || r.original.item_code} (${r.status})` : `❌ ${r.original?.item_code} — ${r.error}`).join("\n");

        toast({
          title: 'Items Submitted',
          description:  <pre className="mt-2 w-full max-w-sm rounded-md bg-slate-950 p-4 whitespace-pre-wrap"><code className="text-white">{result.message}\n\n{feedbackLines}</code></pre>,
        });
      } catch (error: any) {
        toast({
          title: 'Items API Failed',
          description: error.message,
          variant: 'destructive',
        });
      } finally {
        setIsSubmittingItems(false);
      }
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
    setErpExportFile(null);
    setExistingErpInvoiceKeys(new Set());
    setErpSortKey('datum'); // Reset sort
    setErpSortOrder('desc');
    setProcessedFileFingerprints({});


    localStorage.removeItem(LOCAL_STORAGE_PAGE_CACHE_KEY);
    localStorage.removeItem(LOCAL_STORAGE_MATCHER_DATA_KEY);

    toast({
      title: "Invoices Cleared",
      description: "All processed invoices, selected files, and duplicate check data have been cleared. Local cache removed.",
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

        {errorMessage && (
          <Alert variant="destructive" className="my-6 whitespace-pre-wrap">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{errorMessage}</AlertDescription>
          </Alert>
        )}
        
        {status === 'idle' && displayInvoices.length === 0 && selectedFiles.length === 0 && !errorMessage && (
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
              onExportToERPNext={handleExportToERPNext}
              isExportingToERPNext={isExportingToERPNext}
              onExportSuppliersERPNext={handleExportSuppliersERPNext}
              isExportingSuppliers={isExportingSuppliers}
              onSubmitItemsAPI={handleSubmitItemsAPI}
              isSubmittingItems={isSubmittingItems}
              onExportInvoicesAsZip={handleExportInvoicesAsZip} 
              isExportingZip={isExportingZip} 
              onClearAllInvoices={handleClearAllInvoices}
              onExportSuppliersCSV={handleExportSuppliersCSV}
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
