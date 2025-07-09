
'use client';

import React, { useState, useCallback, ChangeEvent, useEffect, useId, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { UploadCloud, FileText, XCircle, AlertCircle, Info, ListChecks, Banknote, Percent, ArrowUpDown, Trash2, RotateCcw, Home } from 'lucide-react'; // Added RotateCcw, Home
import type { BankTransaction, MatchedTransaction, MatchStatus } from '@/lib/bank-matcher/types';
import type { ERPIncomingInvoiceItem } from '@/types/incoming-invoice';
import { parseBankStatementCSV } from '@/lib/bank-matcher/bankStatementParser';
import { matchTransactions } from '@/lib/bank-matcher/matchBankToInvoices';
import { Progress } from '@/components/ui/progress';
import { readFileAsDataURL } from '@/lib/file-helpers';
import { extractBankStatementData, type BankTransactionAI } from '@/ai/flows/extract-bank-statement-data';
import { v4 as uuidv4 } from 'uuid';
import { BankMatcherActionButtons } from './BankMatcherActionButtons';
import { useToast } from '@/hooks/use-toast';

const LOCAL_STORAGE_INVOICE_DATA_KEY = 'processedIncomingInvoicesForMatcher';
const LOCAL_STORAGE_MATCHER_CACHE_KEY = 'bankMatcherPageCache';

type SortOrder = 'asc' | 'desc';
type BankMatcherSortKey =
  | 'transaction.date'
  | 'transaction.amount'
  | 'transaction.description'
  | 'status'
  | 'confidence'
  | 'matchedInvoice.rechnungsnummer'
  | 'matchedInvoice.lieferantName'
  | 'matchedInvoice.pdfFileName';

interface BankMatcherPageCache {
  bankTransactions: BankTransaction[];
  matchedTransactions: MatchedTransaction[];
  sortKey: BankMatcherSortKey | null;
  sortOrder: SortOrder;
  statusMessage: string | null;
}

const sortOptions: { key: BankMatcherSortKey; label: string }[] = [
  { key: 'transaction.date', label: 'Tx Date' },
  { key: 'transaction.amount', label: 'Tx Amount' },
  { key: 'status', label: 'Match Status' },
  { key: 'confidence', label: 'Confidence' },
  { key: 'matchedInvoice.lieferantName', label: 'Inv. Supplier' },
  { key: 'matchedInvoice.rechnungsnummer', label: 'Inv. No.' },
  { key: 'transaction.description', label: 'Tx Description' },
];

function compareValues(valA: any, valB: any, order: SortOrder): number {
  const aIsNil = valA === null || valA === undefined || valA === '';
  const bIsNil = valB === null || valB === undefined || valB === '';

  if (aIsNil && bIsNil) return 0;
  if (aIsNil) return order === 'asc' ? 1 : -1; 
  if (bIsNil) return order === 'asc' ? -1 : 1;

  let comparison = 0;
  if (typeof valA === 'number' && typeof valB === 'number') {
    comparison = valA - valB;
  } else {
    comparison = String(valA).toLowerCase().localeCompare(String(valB).toLowerCase());
  }
  return order === 'asc' ? comparison : -comparison;
}


export function BankMatcherPageContent() {
  const [bankStatementFiles, setBankStatementFiles] = useState<File[]>([]);
  const [bankTransactions, setBankTransactions] = useState<BankTransaction[]>([]);
  const [matchedTransactions, setMatchedTransactions] = useState<MatchedTransaction[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [progressValue, setProgressValue] = useState(0);
  const [currentFileProgressText, setCurrentFileProgressText] = useState('');
  const [availableInvoices, setAvailableInvoices] = useState<ERPIncomingInvoiceItem[]>([]);
  const [currentYear, setCurrentYear] = useState<string>('');
  const { toast } = useToast();

  const [sortKey, setSortKey] = useState<BankMatcherSortKey | null>('transaction.date');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  useEffect(() => {
    setCurrentYear(new Date().getFullYear().toString());
    const storedInvoicesString = localStorage.getItem(LOCAL_STORAGE_INVOICE_DATA_KEY);
    if (storedInvoicesString) {
      try {
        const parsedJson = JSON.parse(storedInvoicesString);
        setAvailableInvoices(Array.isArray(parsedJson) ? parsedJson as ERPIncomingInvoiceItem[] : []);
      } catch (e) {
        console.error(`Failed to parse invoice data from localStorage:`, e);
        setErrorMessage("Error: Could not load invoice data for matching.");
      }
    }
    try {
        const cachedDataString = localStorage.getItem(LOCAL_STORAGE_MATCHER_CACHE_KEY);
        if (cachedDataString) {
            const cachedData = JSON.parse(cachedDataString) as BankMatcherPageCache;
            if (cachedData.bankTransactions) setBankTransactions(cachedData.bankTransactions);
            if (cachedData.matchedTransactions) setMatchedTransactions(cachedData.matchedTransactions);
            if (cachedData.sortKey) setSortKey(cachedData.sortKey);
            if (cachedData.sortOrder) setSortOrder(cachedData.sortOrder);
            if (cachedData.statusMessage && (cachedData.matchedTransactions?.length > 0 || cachedData.bankTransactions?.length > 0) ) setStatusMessage(cachedData.statusMessage);
            else setStatusMessage(null);
        }
    } catch (error) {
        console.error("Failed to load Bank Matcher cache:", error);
        localStorage.removeItem(LOCAL_STORAGE_MATCHER_CACHE_KEY);
    }

  }, []);


  useEffect(() => {
    if (!isProcessing && (bankTransactions.length > 0 || matchedTransactions.length > 0 || statusMessage)) {
      try {
        const cacheToSave: BankMatcherPageCache = {
          bankTransactions,
          matchedTransactions,
          sortKey,
          sortOrder,
          statusMessage,
        };
        localStorage.setItem(LOCAL_STORAGE_MATCHER_CACHE_KEY, JSON.stringify(cacheToSave));
      } catch (error) {
        console.error("Failed to save Bank Matcher cache:", error);
      }
    }
  }, [bankTransactions, matchedTransactions, sortKey, sortOrder, statusMessage, isProcessing]);


  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files.length > 0) {
      const newFilesArray = Array.from(event.target.files);
      const acceptedCsvTypes = ['text/csv', 'application/vnd.ms-excel'];
      const validFiles = newFilesArray.filter(file =>
        (acceptedCsvTypes.includes(file.type) || file.name.toLowerCase().endsWith('.csv')) ||
        (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf'))
      );

      if (validFiles.length !== newFilesArray.length) {
        setErrorMessage("Some files were not CSV or PDF and were ignored. Please select only CSV or PDF files.");
      } else {
        setErrorMessage(null);
      }

      setBankStatementFiles(validFiles);
      setBankTransactions([]);
      setMatchedTransactions([]);
      setStatusMessage("New files selected. Ready to process.");
      localStorage.removeItem(LOCAL_STORAGE_MATCHER_CACHE_KEY); 
    }
  };

  const handleRemoveFile = (fileNameToRemove: string) => {
    const updatedFiles = bankStatementFiles.filter(file => file.name !== fileNameToRemove);
    setBankStatementFiles(updatedFiles);
    if (updatedFiles.length === 0) {
      setBankTransactions([]); 
      setMatchedTransactions([]);
      setStatusMessage("All files removed.");
      localStorage.removeItem(LOCAL_STORAGE_MATCHER_CACHE_KEY);
    }
  };

  const handleClearAllMatcherData = () => {
    setBankStatementFiles([]);
    setBankTransactions([]);
    setMatchedTransactions([]);
    setStatusMessage(null);
    setErrorMessage(null);
    setProgressValue(0);
    setCurrentFileProgressText('');
    setSortKey('transaction.date');
    setSortOrder('desc');
    localStorage.removeItem(LOCAL_STORAGE_MATCHER_CACHE_KEY);
    toast({ title: "Bank Matcher Cleared", description: "All data and selected files have been cleared." });
  };

  const handleProcessStatement = async () => {
    if (bankStatementFiles.length === 0) {
      setErrorMessage("Please select one or more bank statement CSV or PDF files.");
      return;
    }

    setIsProcessing(true);
    setErrorMessage(null);
    setStatusMessage("Starting processing...");
    setProgressValue(0);
    setBankTransactions([]); 
    setMatchedTransactions([]); 

    const allParsedTransactions: BankTransaction[] = [];

    try {
      for (let i = 0; i < bankStatementFiles.length; i++) {
        const file = bankStatementFiles[i];
        setCurrentFileProgressText(`Processing file ${i + 1} of ${bankStatementFiles.length}: ${file.name}`);
        let parsedTxFromSource: BankTransaction[] = [];
        const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

        if (isPdf) {
          setStatusMessage(`Extracting transactions from PDF: ${file.name} using AI...`);
          const dataUri = await readFileAsDataURL(file);
          const aiResult = await extractBankStatementData({ statementDataUri: dataUri });
          parsedTxFromSource = (aiResult.transactions || []).map((tx: BankTransactionAI) => ({
            id: tx.id || uuidv4(),
            date: tx.date,
            description: tx.description || '',
            amount: typeof tx.amount === 'number' ? tx.amount : 0,
            currency: tx.currency || 'EUR',
            recipientOrPayer: tx.recipientOrPayer || '',
          }));
        } else {
          setStatusMessage(`Parsing CSV: ${file.name}...`);
          parsedTxFromSource = await parseBankStatementCSV(file);
        }
        allParsedTransactions.push(...parsedTxFromSource);
        setProgressValue(Math.round(((i + 1) / bankStatementFiles.length) * 40));
      }

      setBankTransactions(allParsedTransactions);
      setCurrentFileProgressText('');

      let processStatusMsg = allParsedTransactions.length === 0
        ? `No transactions found in the selected file(s). `
        : `Parsed ${allParsedTransactions.length} total transactions. `;

      if (availableInvoices.length === 0) {
        processStatusMsg += "No invoices available for matching. Please process invoices first in the 'Incoming Invoices' module.";
        setStatusMessage(processStatusMsg);
        setMatchedTransactions([]); // Ensure empty if no invoices
        setProgressValue(100);
      } else {
        processStatusMsg += `Now matching with ${availableInvoices.length} available invoice(s)...`;
        setStatusMessage(processStatusMsg);
        setProgressValue(50);
        const matches = await matchTransactions(allParsedTransactions, availableInvoices);
        setMatchedTransactions(matches);
        setProgressValue(100);
        const successfulMatchesCount = matches.filter(m => m.status === 'Matched').length;
        const suspectMatchesCount = matches.filter(m => m.status === 'Suspect').length;
        const refundCount = matches.filter(m => m.status === 'Refund').length;
        const rentCount = matches.filter(m => m.status === 'Rent Payment').length;

        let summary = `Matching complete! Found ${successfulMatchesCount} match(es), ${suspectMatchesCount} suspect(s).`;
        if (refundCount > 0) summary += ` Identified ${refundCount} refund(s).`;
        if (rentCount > 0) summary += ` Identified ${rentCount} rent payment(s).`;
        
        setStatusMessage(
          (successfulMatchesCount > 0 || suspectMatchesCount > 0 || refundCount > 0 || rentCount > 0)
            ? summary
            : allParsedTransactions.length > 0
              ? "Matching complete. No specific matches, suspects, refunds, or rent payments identified."
              : "Processing complete. No transactions found."
        );
      }
    } catch (err) {
      console.error("Error processing bank statements:", err);
      let message = "An unknown error occurred during processing.";
      if (err instanceof Error) {
        if (err.message.includes('503') || err.message.includes('overloaded')) {
          message = "The AI service is currently busy or unavailable. Please try again in a few moments.";
        } else {
          message = err.message;
        }
      }
      setErrorMessage(`Failed to process bank statements: ${message}`);
      setStatusMessage(null);
      setCurrentFileProgressText('Processing failed.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRequestSort = (key: BankMatcherSortKey) => {
    setSortOrder(prevOrder => (sortKey === key && prevOrder === 'asc' ? 'desc' : 'asc'));
    setSortKey(key);
  };

  const sortedMatchedTransactions = useMemo(() => {
    if (!sortKey) return matchedTransactions;
    return [...matchedTransactions].sort((a, b) => {
      let valA, valB;
      if (sortKey.startsWith('transaction.')) {
        const subKey = sortKey.split('.')[1] as keyof BankTransaction;
        valA = a.transaction[subKey];
        valB = b.transaction[subKey];
      } else if (sortKey.startsWith('matchedInvoice.')) {
        const subKey = sortKey.split('.')[1] as keyof ERPIncomingInvoiceItem;
        valA = a.matchedInvoice ? a.matchedInvoice[subKey] : null;
        valB = b.matchedInvoice ? b.matchedInvoice[subKey] : null;
      } else {
        valA = a[sortKey as keyof MatchedTransaction];
        valB = b[sortKey as keyof MatchedTransaction];
      }
      return compareValues(valA, valB, sortOrder);
    });
  }, [matchedTransactions, sortKey, sortOrder]);

  const getMatchStatusColorClasses = (status: MatchStatus) => {
    switch (status) {
      case 'Matched': return 'text-green-700 bg-green-100 border-green-500';
      case 'Suspect': return 'text-yellow-700 bg-yellow-100 border-yellow-500';
      case 'Unmatched': return 'text-red-700 bg-red-100 border-red-500';
      case 'Refund': return 'text-blue-700 bg-blue-100 border-blue-500'; // New Style
      case 'Rent Payment': return 'text-purple-700 bg-purple-100 border-purple-500'; // New Style
      default: return 'text-gray-700 bg-gray-100 border-gray-500';
    }
  };
  
  const getStatusIcon = (status: MatchStatus) => {
    switch (status) {
      case 'Refund': return <RotateCcw className="inline h-3 w-3 mr-0.5" />;
      case 'Rent Payment': return <Home className="inline h-3 w-3 mr-0.5" />;
      case 'Matched': return <ListChecks className="inline h-3 w-3 mr-0.5" />;
      case 'Suspect': return <AlertCircle className="inline h-3 w-3 mr-0.5" />;
      default: return null;
    }
  }


  const getSortIndicator = (key: BankMatcherSortKey) => {
    if (sortKey !== key) return <ArrowUpDown className="ml-2 h-3 w-3 opacity-30" />;
    return sortOrder === 'asc'
      ? <ArrowUpDown className="ml-2 h-3 w-3 text-primary" data-testid="sort-asc" />
      : <ArrowUpDown className="ml-2 h-3 w-3 text-primary" data-testid="sort-desc" />;
  };

  const inputId = useId();

  return (
    <div className="container mx-auto px-4 py-8 md:px-8 md:py-12">
      <header className="mb-8 text-center">
        <h1 className="text-3xl md:text-4xl font-headline font-bold text-primary">Bank Statement Matcher</h1>
        <p className="text-muted-foreground mt-2">
          Upload bank statements (CSV/PDF) to match transactions with processed PDF invoices. Results are saved locally.
        </p>
      </header>

      <main className="space-y-8">
        <Card className="w-full max-w-2xl mx-auto shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-headline">
              <UploadCloud className="w-6 h-6 text-primary" /> Upload Bank Statements
            </CardTitle>
            <CardDescription>Select CSV or PDF files. Processed results will be saved for your session.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <label htmlFor={inputId} className="sr-only">Choose files</label>
              <Input
                id={inputId} type="file" accept=".csv,.pdf,text/csv,application/pdf"
                multiple onChange={handleFileChange} disabled={isProcessing}
                className="block w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20"
              />
            </div>
            {bankStatementFiles.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-medium text-foreground">Selected Files:</h3>
                <ul className="max-h-40 overflow-y-auto space-y-1 rounded-md border p-2">
                  {bankStatementFiles.map((file) => (
                    <li key={file.name + file.lastModified} className="flex items-center justify-between text-sm p-1.5 bg-secondary/50 rounded-md">
                      <div className="flex items-center gap-2"><FileText className="w-4 h-4 text-primary" /><span className="truncate max-w-xs" title={file.name}>{file.name}</span></div>
                      {!isProcessing && (<Button variant="ghost" size="sm" onClick={() => handleRemoveFile(file.name)}><XCircle className="w-4 h-4 text-destructive" /></Button>)}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <Button onClick={handleProcessStatement} disabled={isProcessing || bankStatementFiles.length === 0} className="w-full" size="lg">
              {isProcessing ? 'Processing...' : `Match ${bankStatementFiles.length} File${bankStatementFiles.length === 1 ? '' : 's'}`}
            </Button>
             <Button onClick={handleClearAllMatcherData} variant="outline" className="w-full" size="sm" disabled={isProcessing && bankStatementFiles.length === 0 && matchedTransactions.length === 0 && bankTransactions.length === 0}>
                <Trash2 className="mr-2 h-4 w-4" /> Clear All Matcher Data & Selections
            </Button>
          </CardContent>
        </Card>

        {isProcessing && (statusMessage || currentFileProgressText) && (
          <div className="my-6 p-4 border rounded-lg shadow-sm bg-card">
            <Progress value={progressValue} className="w-full mb-2" />
            <p className="text-sm text-center text-muted-foreground">{currentFileProgressText || statusMessage}</p>
          </div>
        )}

        {!isProcessing && !statusMessage && errorMessage && (
          <Alert variant="destructive" className="my-6"><AlertCircle className="h-4 w-4" /><AlertTitle>Error</AlertTitle><AlertDescription>{errorMessage}</AlertDescription></Alert>
        )}

        {!isProcessing && bankTransactions.length === 0 && bankStatementFiles.length === 0 && !errorMessage && !statusMessage && (
          <Alert className="my-6 bg-primary/5 border-primary/20"><Info className="h-4 w-4 text-primary" /><AlertTitle className="text-primary font-semibold">Get Started</AlertTitle>
            <AlertDescription className="text-primary/80">
              Upload bank statements. {availableInvoices.length > 0 ? `${availableInvoices.length} invoice(s) ready for matching.` : "No invoices from 'Incoming Invoices' module found."}
            </AlertDescription>
          </Alert>
        )}
        
        {!isProcessing && statusMessage && bankTransactions.length === 0 && matchedTransactions.length === 0 && !errorMessage && (
             <Alert className="my-6"><Info className="h-4 w-4" /><AlertTitle>Info</AlertTitle><AlertDescription>{statusMessage}</AlertDescription></Alert>
        )}


        {sortedMatchedTransactions.length > 0 && !isProcessing && (
          <>
            <div className="my-4 p-3 border bg-card rounded-md shadow-sm">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                    <span className="text-sm font-medium text-muted-foreground">Sort by:</span>
                    {sortOptions.map(opt => (
                        <Button
                        key={opt.key}
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRequestSort(opt.key)}
                        className={`px-2 py-1 h-auto text-xs sm:text-sm ${sortKey === opt.key ? 'text-primary font-semibold bg-primary/10' : 'text-muted-foreground'}`}
                        >
                        {opt.label}
                        {getSortIndicator(opt.key)}
                        </Button>
                    ))}
                </div>
            </div>

            <BankMatcherActionButtons matchedTransactions={sortedMatchedTransactions} />
            <Card className="mt-8 shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 font-headline"><ListChecks className="w-6 h-6 text-primary" />Matching Results</CardTitle>
                <CardDescription>Review the matched and unmatched bank transactions.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {sortedMatchedTransactions.map((match) => (
                    <Card key={match.transaction.id} className={`border-l-4 ${getMatchStatusColorClasses(match.status)}`}>
                      <CardHeader className="pb-3 pt-4 px-4">
                        <div className="flex justify-between items-start">
                          <div>
                            <CardTitle className="text-base leading-tight">{match.transaction.description || 'N/A'}</CardTitle>
                            <CardDescription className="text-xs mt-0.5">
                              Tx Date: {new Date(match.transaction.date).toLocaleDateString()} | Payer/Recipient: {match.transaction.recipientOrPayer || 'N/A'}
                            </CardDescription>
                          </div>
                          <div className={`text-right ml-2 flex-shrink-0`}>
                            <span className={`px-2.5 py-1 rounded-full text-xs font-semibold shadow-sm ${getMatchStatusColorClasses(match.status)} flex items-center`}>
                                {getStatusIcon(match.status)}
                                {match.status}
                            </span>
                            {match.confidence !== undefined && match.confidence > 0 && (match.status === 'Matched' || match.status === 'Suspect') && (<p className="text-xs text-muted-foreground mt-1 flex items-center justify-end"><Percent className="inline h-3 w-3 mr-0.5" /> {(match.confidence * 100).toFixed(0)}%</p>)}
                          </div>
                        </div>
                        <p className={`text-lg font-semibold mt-1 ${match.transaction.amount < 0 ? 'text-destructive' : 'text-green-600'}`}>
                            <Banknote className="inline h-5 w-5 mr-1 text-primary/80" />
                            {match.transaction.amount.toFixed(2)} {match.transaction.currency || 'EUR'}
                        </p>
                      </CardHeader>
                      {match.matchedInvoice && (match.status === 'Matched' || match.status === 'Suspect') && (
                        <CardContent className="px-4 pb-4 pt-0 border-t border-border/60">
                          <p className="text-sm font-medium mt-2 mb-1 text-primary">Matched Invoice:</p>
                          <div className="text-xs space-y-0.5 text-muted-foreground">
                            <p><strong>Ref:</strong> {match.matchedInvoice.rechnungsnummer || 'N/A'}</p>
                            <p><strong>Supplier:</strong> {match.matchedInvoice.lieferantName || 'N/A'}</p>
                            <p><strong>Inv. Date:</strong> {match.matchedInvoice.datum ? new Date(match.matchedInvoice.datum).toLocaleDateString() : 'N/A'}</p>
                            <p><strong>Inv. Total:</strong> {match.matchedInvoice.gesamtbetrag?.toFixed(2) || 'N/A'} {match.matchedInvoice.wahrung || 'EUR'}</p>
                            <p><strong>File:</strong> {match.matchedInvoice.pdfFileName || 'N/A'}</p>
                          </div>
                        </CardContent>
                      )}
                      {(match.status === 'Unmatched' || match.status === 'Refund' || match.status === 'Rent Payment') && !match.matchedInvoice && (
                        <CardContent className="px-4 pb-3 pt-2">
                          <p className="text-sm text-muted-foreground italic">
                            {match.status === 'Refund' && 'Identified as a refund transaction.'}
                            {match.status === 'Rent Payment' && 'Identified as a rent payment.'}
                            {match.status === 'Unmatched' && (match.transaction.amount >= 0 ? "Income transaction or not a payment." : "No suitable invoice found.")}
                          </p>
                        </CardContent>
                      )}
                    </Card>
                  ))}
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </main>
      <footer className="text-center mt-12 py-4 border-t">
        <p className="text-sm text-muted-foreground">&copy; {currentYear} PDF Suite. AI Powered.</p>
      </footer>
    </div>
  );
}
