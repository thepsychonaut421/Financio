
'use client';

import React, { useState, useCallback, ChangeEvent, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { UploadCloud, FileText, XCircle, AlertCircle, Info, ListChecks, Banknote, Percent } from 'lucide-react';
import type { BankTransaction, MatchedTransaction, MatchStatus } from '@/lib/bank-matcher/types';
import type { ERPIncomingInvoiceItem } from '@/types/incoming-invoice'; 
import { parseBankStatementCSV } from '@/lib/bank-matcher/bankStatementParser';
import { matchTransactions } from '@/lib/bank-matcher/matchBankToInvoices';
import { Progress } from '@/components/ui/progress';
import { readFileAsDataURL } from '@/lib/file-helpers';
import { extractBankStatementData, type BankTransactionAI } from '@/ai/flows/extract-bank-statement-data';
import { v4 as uuidv4 } from 'uuid';
import { BankMatcherActionButtons } from './BankMatcherActionButtons'; // Import the new component

const LOCAL_STORAGE_MATCHER_DATA_KEY = 'processedIncomingInvoicesForMatcher';

export function BankMatcherPageContent() {
  const [bankStatementFile, setBankStatementFile] = useState<File | null>(null);
  const [bankTransactions, setBankTransactions] = useState<BankTransaction[]>([]);
  const [matchedTransactions, setMatchedTransactions] = useState<MatchedTransaction[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [progressValue, setProgressValue] = useState(0);
  const [availableInvoices, setAvailableInvoices] = useState<ERPIncomingInvoiceItem[]>([]);

  useEffect(() => {
    const storedInvoicesString = localStorage.getItem(LOCAL_STORAGE_MATCHER_DATA_KEY);
    if (storedInvoicesString) {
      try {
        const parsedJson = JSON.parse(storedInvoicesString);
        if (Array.isArray(parsedJson)) {
          const parsedInvoices = parsedJson as ERPIncomingInvoiceItem[];
          setAvailableInvoices(parsedInvoices);
        } else {
          console.warn(`Stored data for ${LOCAL_STORAGE_MATCHER_DATA_KEY} is not an array, clearing.`);
          localStorage.removeItem(LOCAL_STORAGE_MATCHER_DATA_KEY);
        }
      } catch (e) {
        console.error(`Failed to parse data from localStorage key ${LOCAL_STORAGE_MATCHER_DATA_KEY}:`, e);
        setErrorMessage("Error: Could not load previously processed invoice data. It might be corrupted.");
        localStorage.removeItem(LOCAL_STORAGE_MATCHER_DATA_KEY);
      }
    }
  }, []);


  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      const file = event.target.files[0];
      const acceptedCsvTypes = ['text/csv', 'application/vnd.ms-excel'];
      const isCsv = acceptedCsvTypes.includes(file.type) || file.name.toLowerCase().endsWith('.csv');
      const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

      if (isCsv || isPdf) {
        setBankStatementFile(file);
        setBankTransactions([]);
        setMatchedTransactions([]);
        setStatusMessage(null); 
        setErrorMessage(null); 
      } else {
        setErrorMessage("Invalid file type. Please select a CSV or PDF file.");
        setBankStatementFile(null);
      }
    }
  };

  const handleRemoveFile = () => {
    setBankStatementFile(null);
    setBankTransactions([]);
    setMatchedTransactions([]);
  };

  const handleProcessStatement = async () => {
    if (!bankStatementFile) {
      setErrorMessage("Please select a bank statement CSV or PDF file.");
      return;
    }

    setIsProcessing(true);
    setErrorMessage(null);
    setStatusMessage("Processing bank statement...");
    setProgressValue(10);

    try {
      let parsedTxFromSource: BankTransaction[] = [];
      const isPdf = bankStatementFile.type === 'application/pdf' || bankStatementFile.name.toLowerCase().endsWith('.pdf');

      if (isPdf) {
        setStatusMessage("Extracting transactions from PDF using AI...");
        setProgressValue(20);
        const dataUri = await readFileAsDataURL(bankStatementFile);
        const aiResult = await extractBankStatementData({ statementDataUri: dataUri }, {model: 'googleai/gemini-1.5-flash-latest'});
        
        parsedTxFromSource = (aiResult.transactions || []).map((tx: BankTransactionAI) => ({
          id: tx.id || uuidv4(), 
          date: tx.date,
          description: tx.description || '',
          amount: typeof tx.amount === 'number' ? tx.amount : 0,
          currency: tx.currency || 'EUR',
          recipientOrPayer: tx.recipientOrPayer || '',
        }));
        setProgressValue(40);
      } else {
        parsedTxFromSource = await parseBankStatementCSV(bankStatementFile);
        setProgressValue(40);
      }
      
      setBankTransactions(parsedTxFromSource);

      let processStatusMsg = "";
      if (parsedTxFromSource.length === 0) {
          processStatusMsg = `No transactions found in ${bankStatementFile.name}. `;
      } else {
          processStatusMsg = `Parsed ${parsedTxFromSource.length} transactions. `;
      }

      if (availableInvoices.length === 0) {
          processStatusMsg += "No invoices available for matching. Please process invoices first in the 'Incoming Invoices' module.";
          setStatusMessage(processStatusMsg);
          setMatchedTransactions([]); 
          setProgressValue(100);
      } else {
          processStatusMsg += `Now matching with ${availableInvoices.length} available invoice(s)...`;
          setStatusMessage(processStatusMsg);
          const matches = await matchTransactions(parsedTxFromSource, availableInvoices);
          setMatchedTransactions(matches);
          setProgressValue(100);
          const successfulMatchesCount = matches.filter(m => m.status === 'Matched').length;
          const suspectMatchesCount = matches.filter(m => m.status === 'Suspect').length;

          if (successfulMatchesCount > 0 || suspectMatchesCount > 0) {
            setStatusMessage(`Matching complete! Found ${successfulMatchesCount} match(es) and ${suspectMatchesCount} suspect(s).`);
          } else if (parsedTxFromSource.length > 0) {
            setStatusMessage("Matching complete. No strong matches or suspects found for the transactions.");
          } else {
            setStatusMessage("Processing complete. No transactions found in the statement.");
          }
      }

    } catch (err) {
      console.error("Error processing bank statement:", err);
      const message = err instanceof Error ? err.message : "An unknown error occurred during processing.";
      setErrorMessage(`Failed to process bank statement: ${message}`);
      setStatusMessage(null);
    } finally {
      setIsProcessing(false);
    }
  };

  const getMatchStatusColorClasses = (status: MatchStatus) => {
    switch (status) {
      case 'Matched': return 'text-green-700 bg-green-100 border-green-500';
      case 'Suspect': return 'text-yellow-700 bg-yellow-100 border-yellow-500';
      case 'Unmatched': return 'text-red-700 bg-red-100 border-red-500';
      default: return 'text-gray-700 bg-gray-100 border-gray-500';
    }
  };
  
  const inputId = React.useId();

  return (
    <div className="container mx-auto px-4 py-8 md:px-8 md:py-12">
      <header className="mb-8 text-center">
        <h1 className="text-3xl md:text-4xl font-headline font-bold text-primary">Bank Statement Matcher</h1>
        <p className="text-muted-foreground mt-2">
          Upload your bank statement (CSV or PDF) to automatically match transactions with processed PDF invoices.
        </p>
      </header>

      <main className="space-y-8">
        <Card className="w-full max-w-2xl mx-auto shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-headline">
              <UploadCloud className="w-6 h-6 text-primary" />
              Upload Bank Statement (CSV or PDF)
            </CardTitle>
            <CardDescription>Select your bank statement file in CSV or PDF format.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <label htmlFor={inputId} className="sr-only">Choose CSV or PDF file</label>
              <Input
                id={inputId}
                type="file"
                accept=".csv,.pdf,text/csv,application/pdf"
                onChange={handleFileChange}
                disabled={isProcessing}
                className="block w-full text-sm text-slate-500
                  file:mr-4 file:py-2 file:px-4
                  file:rounded-full file:border-0
                  file:text-sm file:font-semibold
                  file:bg-primary/10 file:text-primary
                  hover:file:bg-primary/20"
              />
            </div>

            {bankStatementFile && (
              <div className="space-y-2">
                <h3 className="text-sm font-medium text-foreground">Selected File:</h3>
                <div className="flex items-center justify-between text-sm p-1.5 bg-secondary/50 rounded-md">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-primary" />
                    <span className="truncate max-w-xs" title={bankStatementFile.name}>{bankStatementFile.name}</span>
                  </div>
                  {!isProcessing && (
                     <Button variant="ghost" size="sm" onClick={handleRemoveFile} aria-label={`Remove ${bankStatementFile.name}`}>
                        <XCircle className="w-4 h-4 text-destructive" />
                     </Button>
                  )}
                </div>
              </div>
            )}

            <Button
              onClick={handleProcessStatement}
              disabled={isProcessing || !bankStatementFile}
              className="w-full"
              size="lg"
            >
              {isProcessing ? 'Processing...' : 'Match Statement'}
            </Button>
          </CardContent>
        </Card>
        
        {isProcessing && statusMessage && (
           <div className="my-6 p-4 border rounded-lg shadow-sm bg-card">
            <Progress value={progressValue} className="w-full mb-2" />
            <p className="text-sm text-center text-muted-foreground">{statusMessage}</p>
          </div>
        )}
        
        {!isProcessing && !statusMessage && errorMessage && ( 
          <Alert variant="destructive" className="my-6">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{errorMessage}</AlertDescription>
          </Alert>
        )}

        {!isProcessing && bankTransactions.length === 0 && !bankStatementFile && !errorMessage && (
           <Alert className="my-6 bg-primary/5 border-primary/20">
            <Info className="h-4 w-4 text-primary" />
            <AlertTitle className="text-primary font-semibold">Get Started</AlertTitle>
            <AlertDescription className="text-primary/80">
              Upload a bank statement CSV or PDF to begin matching.
              <br/>
              <small className="text-xs">
                {availableInvoices.length > 0 
                  ? `${availableInvoices.length} invoice(s) from the 'Incoming Invoices' module are ready for matching.`
                  : "No invoices found from the 'Incoming Invoices' module. Please process some invoices there first."}
              </small>
            </AlertDescription>
          </Alert>
        )}


        {matchedTransactions.length > 0 && !isProcessing && (
          <>
            <BankMatcherActionButtons matchedTransactions={matchedTransactions} />
            <Card className="mt-8 shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 font-headline">
                  <ListChecks className="w-6 h-6 text-primary" />
                  Matching Results
                </CardTitle>
                <CardDescription>Review the matched and unmatched bank transactions.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {matchedTransactions.map((match) => (
                    <Card key={match.transaction.id} className={`border-l-4 ${getMatchStatusColorClasses(match.status)}`}>
                      <CardHeader className="pb-3 pt-4 px-4">
                        <div className="flex justify-between items-start">
                          <div>
                              <CardTitle className="text-base leading-tight">
                              {match.transaction.description || 'N/A'}
                              </CardTitle>
                              <CardDescription className="text-xs mt-0.5">
                                  Tx Date: {new Date(match.transaction.date).toLocaleDateString()} | Payer/Recipient: {match.transaction.recipientOrPayer || 'N/A'}
                              </CardDescription>
                          </div>
                          <div className={`text-right ml-2 flex-shrink-0`}>
                               <span className={`px-2.5 py-1 rounded-full text-xs font-semibold shadow-sm ${getMatchStatusColorClasses(match.status)}`}>
                                  {match.status}
                               </span>
                              {match.confidence !== undefined && match.confidence > 0 && (
                                   <p className="text-xs text-muted-foreground mt-1 flex items-center justify-end">
                                      <Percent className="inline h-3 w-3 mr-0.5" /> {(match.confidence * 100).toFixed(0)}%
                                   </p>
                              )}
                          </div>
                        </div>
                         <p className="text-lg font-semibold text-foreground mt-1">
                           <Banknote className="inline h-5 w-5 mr-1 text-primary/80" /> 
                           {match.transaction.amount.toFixed(2)} {match.transaction.currency || 'EUR'}
                         </p>
                      </CardHeader>
                      {match.matchedInvoice && (
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
                      {match.status !== 'Matched' && !match.matchedInvoice && (
                           <CardContent className="px-4 pb-3 pt-2">
                              <p className="text-sm text-muted-foreground italic">
                                  {match.transaction.amount >=0 ? "Income transaction or not a payment." : "No suitable invoice found based on current criteria."}
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
        {!isProcessing && !bankStatementFile && bankTransactions.length > 0 && (
            <Alert className="my-6">
                <Info className="h-4 w-4" />
                <AlertTitle>No Bank Statement Selected</AlertTitle>
                <AlertDescription>Please select a bank statement file to process.</AlertDescription>
            </Alert>
        )}

      </main>

      <footer className="text-center mt-12 py-4 border-t">
        <p className="text-sm text-muted-foreground">&copy; {new Date().getFullYear()} PDF Data Extractor & Bank Matcher. Powered by AI.</p>
      </footer>
    </div>
  );
}
