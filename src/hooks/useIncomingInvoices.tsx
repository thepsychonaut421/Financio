'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import type { IncomingInvoiceItem, ERPIncomingInvoiceItem, IncomingProcessingStatus, ERPSortKey, SortOrder } from '@/types/incoming-invoice';
import { useToast } from '@/hooks/use-toast';
import JSZip from 'jszip';
import { downloadFile, incomingInvoicesToERPNextCSVComplete } from '@/lib/export-helpers';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { addDays, parseISO, isValid } from 'date-fns';
import { pageCacheKey, matcherDataKey, kontenrahmenKey } from '@/lib/storage-keys';
import { formatDateForERP, createInvoiceKey } from '@/lib/invoice-helpers';
import { fileToDataURL } from '@/lib/file-helpers';


type Kind = 'purchase' | 'sales';

interface FileWithDataUri {
    name: string;
    dataUri: string;
    size: number;
    lastModified: number;
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
  processedFileFingerprints?: { [key: string]: string };
}

function cap<T>(arr: T[], max = 200) {
  return Array.isArray(arr) && arr.length > max ? arr.slice(0, max) : arr;
}

function pruneForFirestore<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) {
    return obj
      .map((v) => pruneForFirestore(v))
      .filter((v) => v !== undefined) as unknown as T;
  }
  const out: any = {};
  for (const [k, v] of Object.entries(obj as any)) {
    if (v === undefined || Number.isNaN(v)) continue;
    if (v instanceof Date) { out[k] = v.toISOString(); continue; }
    out[k] = pruneForFirestore(v as any);
  }
  return out;
}


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


const getFileFingerprint = (file: {name: string; size: number; lastModified: number}): string => {
    return `${file.name}-${file.size}-${file.lastModified}`;
};


function toErrorString(err: unknown): string {
    if (err instanceof DOMException) {
        if (err.name === 'NotReadableError') {
            return 'The file could not be read. It may be moved, locked by another app, or on a disconnected/unsynced drive. Please reselect the PDF from a local folder.';
        }
        if (err.name === 'SecurityError') {
            return 'The browser blocked access to this file in the current context. Please select the PDF from your local disk (not from a temporary or restricted location).';
        }
    }
    if (err instanceof Error && err.message) return err.message;
    if (typeof err === 'string' && err.trim()) return err.trim();
    if (typeof err === 'object' && err !== null && 'isTrusted' in (err as any)) {
        return 'Browser I/O error (FileReader). Close other tabs/apps, reselect the PDF, or try another file.';
    }
    try {
        const s = JSON.stringify(err);
        if (s && s !== '{}') return s;
    } catch { /* ignore */ }
    return 'Unknown client-side error occurred.';
}


async function postJsonWithTimeout(url: string, body: any, ms = 45_000) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: c.signal,
    });
    return res;
  } catch (err) {
    if ((err as any)?.name === 'AbortError') {
      throw new Error('Network timeout while contacting the server.');
    }
    throw err;
  } finally {
    clearTimeout(t);
  }
}

function friendlyServerError(status: number, fallback: string) {
  switch (status) {
    case 413: return 'PDF is too large (> 8MB). Please upload a smaller file.';
    case 415: return 'File is not a PDF. Please select a valid PDF.';
    case 429: return 'Too many requests. Please try again in a few moments.';
    case 500: return 'Server error during data extraction. Please retry or try another PDF.';
    default:  return fallback;
  }
}

export function useIncomingInvoices(kind: Kind) {
    const { user, isLoading: isAuthLoading } = useAuth();
    const [selectedFiles, setSelectedFiles] = useState<FileWithDataUri[]>([]);
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
    const [kontenrahmen, setKontenrahmen] = useState(
        kind === 'purchase' ? '20000 - Verbindlichkeiten Lief Inland' : '10000 - Forderungen aus Lief Leist Inland'
    );
    const [processedFileFingerprints, setProcessedFileFingerprints] = useState<Record<string, string>>({});
    const [existingErpInvoiceKeys, setExistingErpInvoiceKeys] = useState<Set<string>>(new Set());
    const [erpSortKey, setErpSortKey] = useState<ERPSortKey | null>('datum');
    const [erpSortOrder, setErpSortOrder] = useState<SortOrder>('desc');

    const LOCAL_STORAGE_PAGE_CACHE_KEY = useMemo(() => pageCacheKey(kind), [kind]);
    const LOCAL_STORAGE_MATCHER_DATA_KEY = useMemo(() => matcherDataKey(kind), [kind]);
    const KONTENRAHMEN_KEY = useMemo(() => kontenrahmenKey(kind), [kind]);

    const findCachedInvoiceByFilename = useCallback((name: string, erpMode: boolean) => {
        try {
            const cachedStr = localStorage.getItem(LOCAL_STORAGE_PAGE_CACHE_KEY);
            if (!cachedStr) return null;
            const cached = JSON.parse(cachedStr) as IncomingInvoicesPageCache;
            const list = erpMode ? cached.erpProcessedInvoices : cached.extractedInvoices;
            return Array.isArray(list) ? list.find(inv => inv.pdfFileName === name) : null;
        } catch { return null; }
    }, [LOCAL_STORAGE_PAGE_CACHE_KEY]);

    useEffect(() => {
        const year = new Date().getFullYear().toString();
        setCurrentYear(year);
    }, []);

    useEffect(() => {
        try {
            const cachedDataString = localStorage.getItem(LOCAL_STORAGE_PAGE_CACHE_KEY);
            if (!cachedDataString) return;

            const parsedJson = JSON.parse(cachedDataString) as Partial<IncomingInvoicesPageCache>;

            if (parsedJson && typeof parsedJson === 'object' && 'status' in parsedJson) {
                setExtractedInvoices(Array.isArray(parsedJson.extractedInvoices) ? parsedJson.extractedInvoices : []);
                setErpProcessedInvoices(Array.isArray(parsedJson.erpProcessedInvoices) ? parsedJson.erpProcessedInvoices : []);
                setErpMode(typeof parsedJson.erpMode === 'boolean' ? parsedJson.erpMode : false);
                setKontenrahmen(parsedJson.kontenrahmen || (kind === 'purchase' ? '20000 - Verbindlichkeiten Lief Inland' : '10000 - Forderungen aus Lief Leist Inland'));

                if (Array.isArray(parsedJson.existingErpInvoiceKeys)) {
                    setExistingErpInvoiceKeys(new Set(parsedJson.existingErpInvoiceKeys));
                }

                setErpSortKey((parsedJson.erpSortKey as any) || 'datum');
                setErpSortOrder((parsedJson.erpSortOrder as any) || 'desc');
                setProcessedFileFingerprints(parsedJson.processedFileFingerprints || {});

                const hasAny = (parsedJson.extractedInvoices?.length || 0) > 0 || (parsedJson.erpProcessedInvoices?.length || 0) > 0;
                setStatus(hasAny ? (parsedJson.status as any) : 'idle');
            } else {
                localStorage.removeItem(LOCAL_STORAGE_PAGE_CACHE_KEY);
            }
        } catch (error) {
            console.error(`Failed to load cache from ${LOCAL_STORAGE_PAGE_CACHE_KEY}:`, error);
            localStorage.removeItem(LOCAL_STORAGE_PAGE_CACHE_KEY);
        }
    }, [LOCAL_STORAGE_PAGE_CACHE_KEY, kind]);

    useEffect(() => {
        const v = localStorage.getItem(KONTENRAHMEN_KEY);
        if (v) setKontenrahmen(v);
    }, [KONTENRAHMEN_KEY]);

    useEffect(() => {
        localStorage.setItem(KONTENRAHMEN_KEY, kontenrahmen);
    }, [kontenrahmen, KONTENRAHMEN_KEY]);

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
                localStorage.setItem(LOCAL_STORAGE_PAGE_CACHE_KEY, JSON.stringify(cacheToSave));
            } catch (err) {
                console.error('Failed to save page cache:', err);
            }
        }
    }, [
        extractedInvoices, erpProcessedInvoices, erpMode, status, 
        existingErpInvoiceKeys, erpSortKey, erpSortOrder, kontenrahmen, 
        processedFileFingerprints, LOCAL_STORAGE_PAGE_CACHE_KEY
    ]);

    const supplierMap: Record<string, string> = {
        "LIDL": "Lidl", "LIDL DIGITAL DEUTSCHLAND GMBH & CO. KG": "Lidl",
        "KAUFLAND MARKETPLACE GMBH": "Kaufland", "KAUFLAND": "Kaufland",
        "GD ARTLANDS ETRADING GMBH": "GD Artlands eTrading GmbH", "RETOURA": "RETOURA",
        "DOITBAU GMBH & CO.KG": "doitBau", "ALDI": "ALDI E-Commerce", 
        "FIRMA HANDLOWA KABIS BOZENA KEDZIORA": "FIRMA HANDLOWA KABIS BOZENA KEDZIORA",
        "ZWECO UG": "Zweco UG", "FAVORIO C/O HATRACO GMBH": "Favorio c/o Hatraco GmbH",
        "HATRACO GMBH": "Hatraco GmbH", "CUMO GMBH": "CUMO GmbH", "SELLIXX GMBH": "SELLIXX GmbH",
        "UNBEKANNT": "UNBEKANNT_SUPPLIER_PLACEHOLDER", "UNBEKANNT_SUPPLIER_AI_EXTRACTED": "UNBEKANNT_SUPPLIER_PLACEHOLDER",
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
        if (daysMatch?.[1]) {
            const days = parseInt(daysMatch[1], 10);
            if (!isNaN(days)) return addDays(invoiceDate, days).toISOString().slice(0, 10);
        }
        return erpInvoiceDate;
    };

    const handleFilesSelected = useCallback(async (files: File[]) => {
        setStatus('processing');
        setCurrentFileProgress(`Reading ${files.length} file(s)...`);
        const filesWithData: FileWithDataUri[] = [];
        for (const file of files) {
            try {
                const dataUri = await fileToDataURL(file);
                filesWithData.push({ name: file.name, dataUri, size: file.size, lastModified: file.lastModified });
            } catch (e) {
                setErrorMessage(`Could not read file: ${file.name}. Error: ${toErrorString(e)}`);
                setStatus('error');
                return;
            }
        }
        setSelectedFiles(filesWithData);
        setStatus('idle');
        setCurrentFileProgress('');
    }, []);

    const handleRemoveFile = (fileName: string) => {
        setSelectedFiles(prev => prev.filter(f => f.name !== fileName));
    };

    const handleProcessFiles = async () => {
        if (selectedFiles.length === 0) {
            setErrorMessage("No files selected.");
            setStatus('error');
            return;
        }
        setErrorMessage(null);
        setStatus('processing');
        setProgressValue(0);

        const currentRegularInvoices = [...extractedInvoices];
        const currentErpInvoices = [...erpProcessedInvoices];
        const newFingerprints = { ...processedFileFingerprints };
        const duplicates: string[] = [];

        const filesToProcess = selectedFiles.filter(file => {
            const fingerprint = getFileFingerprint(file);
            if (newFingerprints[fingerprint]) {
                duplicates.push(file.name);
                const existsInUi = (erpMode ? currentErpInvoices : currentRegularInvoices).some(inv => inv.pdfFileName === file.name);
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
                description: `${duplicates.length} file(s) already processed: ${duplicates.join(', ')}. Restored from cache if not visible.`,
            });
            setExtractedInvoices(currentRegularInvoices);
            setErpProcessedInvoices(currentErpInvoices);
        }

        if (filesToProcess.length === 0) {
            setStatus('success');
            setCurrentFileProgress('No new files to process. Duplicates were skipped.');
            return;
        }

        const accumulatedErrors: { fileName: string, message: string }[] = [];
        for (let i = 0; i < filesToProcess.length; i++) {
            const file = filesToProcess[i];
            setCurrentFileProgress(`Processing file ${i + 1} of ${filesToProcess.length}: ${file.name}`);
            try {
                const response = await postJsonWithTimeout('/api/invoices/extract', { dataUri: file.dataUri, filename: file.name });
                
                let responseText = await response.text();
                
                if (!response.ok) {
                    let msg = `Server error: ${response.status} ${response.statusText}`;
                    try {
                        const j = JSON.parse(responseText);
                        msg = friendlyServerError(response.status, j.error || j.message || msg);
                    } catch { /* ignore */ }
                    throw new Error(msg);
                }

                if (!responseText) {
                    throw new Error('Server returned an empty response.');
                }
                
                responseText = responseText.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();

                if (!responseText.startsWith('{')) {
                    throw new Error('Model did not return valid JSON. The response may be blocked or empty.');
                }
                
                let aiResult = JSON.parse(responseText);

                if (aiResult.error) throw new Error(aiResult.error);
                
                const fingerprint = getFileFingerprint(file);
                newFingerprints[fingerprint] = file.name;

                let finalLieferantName = (aiResult.lieferantName || "").trim();
                const upperCaseName = finalLieferantName.toUpperCase();
                if (supplierMap[upperCaseName]) finalLieferantName = supplierMap[upperCaseName];
                else if (!finalLieferantName || finalLieferantName === "UNBEKANNT") finalLieferantName = "UNBEKANNT_SUPPLIER_PLACEHOLDER";
                
                let istBezahltStatus: 0 | 1 = aiResult.isPaid ? 1 : 0;
                
                const erpCompatibleInvoice: ERPIncomingInvoiceItem = {
                    pdfFileName: file.name,
                    rechnungsnummer: aiResult.rechnungsnummer || `INTERNAL-${new Date().toISOString().slice(0,10)}-${Math.random().toString(36).slice(2,7).toUpperCase()}`,
                    datum: aiResult.datum,
                    lieferantName: finalLieferantName,
                    gesamtbetrag: aiResult.gesamtbetrag,
                    rechnungspositionen: aiResult.rechnungspositionen,
                    wahrung: aiResult.wahrung,
                    istBezahlt: istBezahltStatus,
                    kontenrahmen: kontenrahmen.trim(),
                    kind: kind,
                    lieferantAdresse: aiResult.lieferantAdresse,
                    zahlungsziel: aiResult.zahlungsziel,
                    zahlungsart: aiResult.zahlungsart,
                    mwstSatz: aiResult.mwstSatz != null ? String(aiResult.mwstSatz) : undefined,
                    kundenNummer: aiResult.kundenNummer,
                    bestellNummer: aiResult.bestellNummer,
                    isPaidByAI: aiResult.isPaid,
                    billDate: aiResult.bill_date,
                    dueDate: calculateDueDate(aiResult.datum, aiResult.zahlungsziel),
                    remarks: aiResult.remarks,
                };

                if (erpMode) currentErpInvoices.unshift(erpCompatibleInvoice);
                else currentRegularInvoices.unshift(erpCompatibleInvoice);

                try {
                    if (user?.uid) {
                        const docToSave = {
                            userId: user.uid,
                            filename: file.name,
                            status: aiResult?.anomalies?.includes('AI_CRASH_FALLBACK') ? 'ERROR' : (aiResult?.anomalies?.length ? 'WARN' : 'OK'),
                            erpMode: true,
                            payload: { ...erpCompatibleInvoice, rechnungspositionen: erpCompatibleInvoice.rechnungspositionen ?? [] },
                            createdAt: serverTimestamp(),
                            kind: kind, // Add kind to Firestore document
                        };
                        await addDoc(collection(db, "processed_invoices"), pruneForFirestore(docToSave));
                    }
                } catch (e) {
                    console.error('Firestore persistence failed:', e);
                }
            } catch (error) {
                accumulatedErrors.push({ fileName: file.name, message: toErrorString(error) });
            } finally {
                setProgressValue(Math.round(((i + 1) / filesToProcess.length) * 100));
            }
        }

        setExtractedInvoices(currentRegularInvoices);
        setErpProcessedInvoices(currentErpInvoices);
        setProcessedFileFingerprints(newFingerprints);
        
        const invoicesForMatcher = (erpMode ? currentErpInvoices : currentRegularInvoices).map(inv => ({
            pdfFileName: inv.pdfFileName, rechnungsnummer: inv.rechnungsnummer, datum: formatDateForERP(inv.datum),
            lieferantName: inv.lieferantName, gesamtbetrag: inv.gesamtbetrag, rechnungspositionen: inv.rechnungspositionen,
        }));
        const previousMatcherData = JSON.parse(localStorage.getItem(LOCAL_STORAGE_MATCHER_DATA_KEY) || '[]');
        localStorage.setItem(LOCAL_STORAGE_MATCHER_DATA_KEY, JSON.stringify([...invoicesForMatcher, ...previousMatcherData]));
        
        if (accumulatedErrors.length > 0) {
            setErrorMessage(accumulatedErrors.map(e => `${e.fileName}: ${e.message || 'Unknown error'}`).join('\n'));
        }
        
        setStatus('success');
        setCurrentFileProgress('Processing complete!');
    };

    const handleClearAllInvoices = () => {
        setSelectedFiles([]); setExtractedInvoices([]); setErpProcessedInvoices([]);
        setStatus('idle'); setProgressValue(0); setCurrentFileProgress('');
        setErrorMessage(null); setExistingErpInvoiceKeys(new Set());
        setErpSortKey('datum'); setErpSortOrder('desc');
        setProcessedFileFingerprints({});
        localStorage.removeItem(LOCAL_STORAGE_PAGE_CACHE_KEY);
        localStorage.removeItem(LOCAL_STORAGE_MATCHER_DATA_KEY);
        toast({ title: "Invoices Cleared", description: "All data and caches have been cleared." });
    };

    const handleErpSortRequest = (key: ERPSortKey) => {
        setErpSortOrder(prev => (erpSortKey === key && prev === 'asc' ? 'desc' : 'asc'));
        setErpSortKey(key);
    };

    const sortedErpProcessedInvoices = useMemo(() => {
        if (!erpSortKey) return erpProcessedInvoices;
        return [...erpProcessedInvoices].sort((a, b) => compareERPValues(a[erpSortKey], b[erpSortKey], erpSortOrder));
    }, [erpProcessedInvoices, erpSortKey, erpSortOrder]);

    const displayInvoices = erpMode ? sortedErpProcessedInvoices : extractedInvoices;

    const handleExportToERPNext = async () => {
        const invoicesToExport = erpMode ? sortedErpProcessedInvoices : erpProcessedInvoices;
        if (!invoicesToExport.length || !user) {
            toast({ title: "Error", description: "No data to export or not logged in.", variant: "destructive" });
            return;
        }
        setIsExportingToERPNext(true);
        try {
            const response = await fetch('/api/erpnext/invoices', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ invoices: invoicesToExport, uid: user.uid }),
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || result.message);
            toast({ title: "Export Status", description: result.message, variant: response.status === 207 ? "default" : "default" });
        } catch (error) {
            toast({ title: "ERPNext Export Failed", description: toErrorString(error), variant: "destructive" });
        } finally {
            setIsExportingToERPNext(false);
        }
    };
    
    const handleExportSuppliersERPNext = async () => {
        const invoicesToUse = erpMode ? sortedErpProcessedInvoices : erpProcessedInvoices;
        if (!invoicesToUse.length) return;
        const uniqueSuppliers = new Map(invoicesToUse.map(inv => [(inv.lieferantName || '').trim().toUpperCase(), inv])).values();
        const supplierPayloads = Array.from(uniqueSuppliers).filter(inv => inv.lieferantName && inv.lieferantName.trim().toUpperCase() !== "UNBEKANNT_SUPPLIER_PLACEHOLDER")
            .map(inv => ({ name: inv.lieferantName, type: "Unternehmen", group: "All Suppliers", country: "Deutschland", address: { line1: inv.lieferantAdresse } }));
        if (!supplierPayloads.length) {
            toast({ title: "No New Suppliers", description: "No unique suppliers to export." });
            return;
        }
        setIsExportingSuppliers(true);
        try {
            const response = await fetch('/api/erpnext/suppliers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ suppliers: supplierPayloads }) });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || result.message);
            const feedback = (result.results || []).map((r:any) => r.ok ? `✅ ${r.name} (${r.status})` : `❌ ${r.name} — ${r.error}`).join("\n");
            toast({ title: `Suppliers API: ${result.succeeded}/${result.total}`, description: <pre className="mt-2 w-full max-w-sm rounded-md bg-slate-950 p-4 whitespace-pre-wrap"><code className="text-white">{feedback}</code></pre> });
        } catch (error) {
            toast({ title: "Supplier Export Failed", description: toErrorString(error), variant: "destructive" });
        } finally {
            setIsExportingSuppliers(false);
        }
    };

    const handleExportSuppliersCSV = async () => {
        const invoicesToUse = erpMode ? sortedErpProcessedInvoices : erpProcessedInvoices;
        if (!invoicesToUse.length) return;
        try {
            const response = await fetch('/api/csv/export', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ doctype: 'Supplier', payload: invoicesToUse, filename: 'erpnext_suppliers.csv' }),
            });
            if (!response.ok) throw new Error((await response.json()).error);
            downloadFile(await response.blob(), 'erpnext_suppliers.csv', 'text/csv;charset=utf-8');
            toast({ title: "Suppliers Exported", description: "Supplier data exported to CSV." });
        } catch (error) {
            toast({ title: "Export Failed", description: toErrorString(error), variant: "destructive" });
        }
    };
    
    const handleSubmitItemsAPI = async () => {
        const invoicesToUse = erpMode ? sortedErpProcessedInvoices : erpProcessedInvoices;
        if (!invoicesToUse.length) return;
        const items = invoicesToUse.flatMap(inv => inv.rechnungspositionen || []).map(item => ({ item_code: item.productCode || item.productName, item_name: item.productName || item.productCode, stock_uom: 'Stk' })).filter(item => item.item_code);
        const uniqueItems = Array.from(new Map(items.map(item => [item.item_code, item])).values());
        if (!uniqueItems.length) return;
        setIsSubmittingItems(true);
        try {
            const response = await fetch('/api/erpnext/items', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: uniqueItems }) });
            if (!response.ok) throw new Error((await response.json()).error);
            const result = await response.json();
            const feedback = (result.results || []).map((r:any) => r.success ? `✅ ${r.data?.item_code || r.original.item_code} (${r.status})` : `❌ ${r.original?.item_code} — ${r.error}`).join("\n");
            toast({ title: 'Items Submitted', description: <pre className="mt-2 w-full max-w-sm rounded-md bg-slate-950 p-4 whitespace-pre-wrap"><code className="text-white">{result.message}\n\n{feedback}</code></pre> });
        } catch (error) {
            toast({ title: 'Items API Failed', description: toErrorString(error), variant: 'destructive' });
        } finally {
            setIsSubmittingItems(false);
        }
    };
    
    const handleExportInvoicesAsZip = async () => {
        const invoicesToZip = erpMode ? sortedErpProcessedInvoices : erpProcessedInvoices;
        if (!invoicesToZip.length) return;
        setIsExportingZip(true);
        const zip = new JSZip();
        for (const invoice of invoicesToZip) {
            const csv = incomingInvoicesToERPNextCSVComplete([invoice], user?.uid);
            const filename = `ERPNext_Invoice_${(invoice.rechnungsnummer || `inv_${Math.random()}`).replace(/[^a-zA-Z0-9_.-]/g, '_').substring(0, 50)}.csv`;
            zip.file(filename, csv);
        }
        try {
            const blob = await zip.generateAsync({ type: "blob" });
            downloadFile(blob, "erpnext_individual_invoices.zip", "application/zip");
            toast({ title: "ZIP Export Successful", description: `${invoicesToZip.length} invoices exported.` });
        } catch (error) {
            toast({ title: "ZIP Export Failed", description: toErrorString(error), variant: "destructive" });
        } finally {
            setIsExportingZip(false);
        }
    };
    
    const memoizedSetErpMode = useCallback((checked: boolean) => {
        setErpMode(checked);
        setSelectedFiles([]);
        setExtractedInvoices([]);
        setErpProcessedInvoices([]);
        setStatus('idle');
        setCurrentFileProgress('');
        setProgressValue(0);
        setErrorMessage(null);
    }, []);

    return {
        selectedFiles, extractedInvoices, erpProcessedInvoices, status,
        progressValue, currentFileProgress, errorMessage, erpMode,
        isExportingToERPNext, isExportingSuppliers, isSubmittingItems,
        isExportingZip, currentYear, kontenrahmen, existingErpInvoiceKeys,
        erpSortKey, erpSortOrder, sortedErpProcessedInvoices, displayInvoices,
        setErpMode: memoizedSetErpMode,
        handleFilesSelected, handleProcessFiles, handleRemoveFile,
        handleExportToERPNext, handleExportSuppliersERPNext, handleExportSuppliersCSV,
        handleSubmitItemsAPI, handleExportInvoicesAsZip, handleClearAllInvoices,
        handleErpSortRequest, setKontenrahmen,
    };
}
