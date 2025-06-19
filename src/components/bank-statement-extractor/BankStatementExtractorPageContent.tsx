
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
import { v4 as uuidv4 } from 'uuid';

type ProcessingStatus = 'idle' | 'processing' | 'success' | 'error';

export function BankStatementExtractorPageContent() {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [extractedTransactions, setExtractedTransactions] = useState<BankTransactionAI[]>([]);
  const [status, setStatus] = useState<ProcessingStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [currentFileProgress, setCurrentFileProgress] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [currentYear, setCurrentYear] = useState<string>('');

  useEffect(() => {
    setCurrentYear(new Date().getFullYear().toString());
  }, []);

  const handleFilesSelected = useCallback((files: File[]) => {
    setSelectedFiles(files);
    setExtractedTransactions([]);
    setStatus('idle');
    setErrorMessage(null);
    setProgress(0);
    setCurrentFileProgress('');
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
        // The extractBankStatementData flow already handles ID generation and normalization
        const extractionResult = await extractBankStatementData({ statementDataUri: dataUri });
        
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
      let message = 'An unexpected error occurred during processing.';
      if (error instanceof Error) {
        message = error.message;
      }
      setErrorMessage(message);
      setStatus('error');
      setCurrentFileProgress('Processing failed.');
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
            <BankStatementActionButtons transactions={extractedTransactions} />
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
