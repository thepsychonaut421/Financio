
'use client';

import React, { useState, useCallback, ChangeEvent, useEffect } from 'react';
import { BankStatementUploadForm } from '@/components/bank-statement-extractor/BankStatementUploadForm';
import { BankStatementDataTable } from '@/components/bank-statement-extractor/BankStatementDataTable';
import { BankStatementActionButtons } from '@/components/bank-statement-extractor/BankStatementActionButtons';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle, Info } from 'lucide-react';
import { readFileAsDataURL } from '@/lib/file-helpers';
import { extractBankStatementData, type BankTransactionAI } from '@/ai/flows/extract-bank-statement-data';
import { useToast } from '@/hooks/use-toast';

type ProcessingStatus = 'idle' | 'processing' | 'success' | 'error';

interface ExtractorState {
  // We can't persist File objects, so we store their data URIs and names
  files: { name: string; dataUri: string }[];
  transactions: BankTransactionAI[];
  status: ProcessingStatus;
}

const LOCAL_STORAGE_KEY = 'bankStatementExtractorCache';

export function BankStatementExtractorPageContent() {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [extractedTransactions, setExtractedTransactions] = useState<BankTransactionAI[]>([]);
  const [status, setStatus] = useState<ProcessingStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [currentFileProgress, setCurrentFileProgress] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [currentYear, setCurrentYear] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    setCurrentYear(new Date().getFullYear().toString());

    // Load from localStorage on initial mount
    try {
      const cachedStateJSON = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (cachedStateJSON) {
        const cachedState: ExtractorState = JSON.parse(cachedStateJSON);
        // We can't restore File objects, but we can show that files were selected
        // For simplicity, we just restore the transactions and status.
        // A more advanced implementation could re-create File objects from blobs if needed.
        if (cachedState.transactions.length > 0) {
            setExtractedTransactions(cachedState.transactions);
            setStatus(cachedState.status);
        }
      }
    } catch (e) {
      console.error("Failed to load state from localStorage", e);
      localStorage.removeItem(LOCAL_STORAGE_KEY);
    }
  }, []);

  // Persist to localStorage whenever transactions or status change
  useEffect(() => {
    if (status !== 'processing' && status !== 'idle') {
        try {
            const stateToCache: Partial<ExtractorState> = {
                transactions: extractedTransactions,
                status: status,
            };
            localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(stateToCache));
        } catch (e) {
            console.error("Failed to save state to localStorage", e);
        }
    }
  }, [extractedTransactions, status]);


  const handleFilesSelected = useCallback((files: File[]) => {
    setSelectedFiles(files);
    setExtractedTransactions([]);
    setStatus('idle');
    setErrorMessage(null);
    setProgress(0);
    setCurrentFileProgress('');
    localStorage.removeItem(LOCAL_STORAGE_KEY); // Clear cache on new file selection
  }, []);

  const handleProcessFiles = async () => {
    if (selectedFiles.length === 0) {
      setErrorMessage("No files selected. Please select PDF files to process.");
      setStatus('error');
      return;
    }

    setStatus('processing');
    setErrorMessage(null);
    setProgress(0);
    
    let allTransactions: BankTransactionAI[] = [];

    try {
      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];
        setCurrentFileProgress(`Processing file ${i + 1} of ${selectedFiles.length}: ${file.name}`);
        
        const dataUri = await readFileAsDataURL(file);
        const extractionResult = await extractBankStatementData({ statementDataUri: dataUri });

        if (extractionResult.error) {
          setErrorMessage(extractionResult.error);
          setStatus('error');
          setCurrentFileProgress('Processing failed.');
          return;
        }
        
        if (extractionResult && extractionResult.transactions) {
          allTransactions = allTransactions.concat(extractionResult.transactions);
        }
        setProgress(Math.round(((i + 1) / selectedFiles.length) * 100));
      }
      
      setExtractedTransactions(allTransactions);
      setStatus('success');
      setCurrentFileProgress(allTransactions.length > 0 ? 'Processing complete!' : 'Processing complete. No transactions found.');

    } catch (error) {
      console.error("Error processing bank statement PDFs:", error);
      const message = error instanceof Error ? error.message : 'An unexpected error occurred during processing.';
      setErrorMessage(message);
      setStatus('error');
      setCurrentFileProgress('Processing failed.');
    }
  };

  const handleSubmitToERPNext = async () => {
    if (extractedTransactions.length === 0) {
      toast({ title: "No Data", description: "No transactions to submit to ERPNext.", variant: "destructive" });
      return;
    }
    setIsSubmitting(true);

    const BATCH_SIZE = 75;
    let totalCreated = 0;
    let totalExists = 0;
    let totalErrors = 0;

    try {
        for (let i = 0; i < extractedTransactions.length; i += BATCH_SIZE) {
            const chunk = extractedTransactions.slice(i, i + BATCH_SIZE);
            
            const transactionsForAPI = chunk.map(t => ({
                bank_account: process.env.NEXT_PUBLIC_ERPNEXT_BANK_ACCOUNT || "Bank Account",
                date: t.date,
                amount: t.amount,
                description: t.description,
                reference_number: t.id,
                party: t.recipientOrPayer,
                party_type: t.recipientOrPayer ? 'Supplier' : undefined,
            }));

            const response = await fetch('/api/erpnext/bank', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ transactions: transactionsForAPI }),
            });

            const contentType = response.headers.get("content-type");
            if (!response.ok || !contentType || !contentType.includes("application/json")) {
                const errorText = await response.text();
                throw new Error(`Server responded with an error: ${response.status} ${response.statusText}. Response: ${errorText.substring(0, 500)}`);
            }

            const result = await response.json();
            if (!result.ok) {
                throw new Error(result.error || 'An unknown error occurred during batch submission.');
            }
            
            if(result.summary) {
                totalCreated += result.summary.created || 0;
                totalExists += result.summary.exists || 0;
                totalErrors += result.summary.errors || 0;
            }
        }
        
        const message = `Created: ${totalCreated}, Exists (Skipped): ${totalExists}, Errors: ${totalErrors}`;
        toast({
            title: "Bank Transactions Submission Complete",
            description: (
                <pre className="mt-2 w-full max-w-sm rounded-md bg-slate-950 p-4 whitespace-pre-wrap">
                  <code className="text-white">{message}</code>
                </pre>
            ),
        });

    } catch (error: any) {
        toast({ title: "Submission Failed", description: error.message, variant: "destructive" });
    } finally {
        setIsSubmitting(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8 md:px-8 md:py-12 flex-grow">
      <header className="mb-8 text-center">
        <h1 className="text-3xl md:text-4xl font-headline font-bold text-primary">Bank Statement Extractor</h1>
        <p className="text-muted-foreground mt-2">
          Upload your bank statement PDFs to automatically extract transaction details.
        </p>
      </header>

      <main className="space-y-8">
        <BankStatementUploadForm
          onFilesSelected={handleFilesSelected}
          onProcess={handleProcessFiles}
          isProcessing={status === 'processing'}
          selectedFileCount={selectedFiles.length}
        />

        {status === 'processing' && (
          <div className="my-6 p-4 border rounded-lg shadow-sm bg-card">
            <Progress value={progress} className="w-full mb-2" />
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
        
        {status === 'idle' && extractedTransactions.length === 0 && selectedFiles.length === 0 && (
           <Alert className="my-6 bg-primary/5 border-primary/20">
            <Info className="h-4 w-4 text-primary" />
            <AlertTitle className="text-primary font-semibold">Get Started</AlertTitle>
            <AlertDescription className="text-primary/80">
              Upload one or more bank statement PDF files. Extracted transactions will appear in a table below.
            </AlertDescription>
          </Alert>
        )}

        {(status === 'success' || (status !== 'processing' && extractedTransactions.length > 0)) && (
          <div className="mt-8">
            <BankStatementActionButtons 
                transactions={extractedTransactions} 
                isSubmitting={isSubmitting}
                onSubmitToERPNext={handleSubmitToERPNext}
             />
            <BankStatementDataTable transactions={extractedTransactions} />
          </div>
        )}

         {status === 'success' && extractedTransactions.length === 0 && selectedFiles.length > 0 && (
           <Alert className="my-6">
            <Info className="h-4 w-4" />
            <AlertTitle>No Data Extracted</AlertTitle>
            <AlertDescription>
              Processing finished, but no transactions could be extracted from the uploaded PDFs. Please check your files or try different ones.
            </AlertDescription>
          </Alert>
        )}
      </main>
      <footer className="text-center mt-12 py-4 border-t">
        <p className="text-sm text-muted-foreground">&copy; {currentYear} PDF Suite. Powered by AI.</p>
      </footer>
    </div>
  );
}
