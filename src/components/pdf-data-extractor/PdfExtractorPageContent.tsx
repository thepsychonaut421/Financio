
'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { PdfUploadForm } from '@/components/pdf-data-extractor/PdfUploadForm';
import { InvoiceDataTable } from '@/components/pdf-data-extractor/InvoiceDataTable';
import { ActionButtons } from '@/components/pdf-data-extractor/ActionButtons';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle, Info } from 'lucide-react';
import { readFileAsDataURL } from '@/lib/file-helpers';
import { extractInvoiceData } from '@/ai/flows/extract-invoice-data';
import { normalizeAndDeduplicateData } from '@/ai/flows/normalize-and-deduplicate-data';
import type { ExtractInvoiceDataOutput } from '@/ai/flows/extract-invoice-data';
import type { ExtractedItem, ProcessingStatus } from '@/types/invoice';

export function PdfExtractorPageContent() {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [extractedItems, setExtractedItems] = useState<ExtractedItem[]>([]);
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
    setExtractedItems([]);
    setStatus('idle');
    setErrorMessage(null);
    setProgress(0);
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
    setExtractedItems([]);
    
    let allInvoiceDetails: ExtractedItem[] = [];

    try {
      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];
        setCurrentFileProgress(`Processing file ${i + 1} of ${selectedFiles.length}: ${file.name}`);
        
        const dataUri = await readFileAsDataURL(file);
        const extractionResult: ExtractInvoiceDataOutput = await extractInvoiceData({ invoiceDataUri: dataUri });

        if (extractionResult.error) {
          setErrorMessage(extractionResult.error);
          setStatus('error');
          setCurrentFileProgress('Processing failed.');
          return;
        }
        
        if (extractionResult && extractionResult.invoiceDetails) {
          allInvoiceDetails = allInvoiceDetails.concat(extractionResult.invoiceDetails);
        }
        setProgress(Math.round(((i + 1) / selectedFiles.length) * 90));
      }

      setCurrentFileProgress('Normalizing and deduplicating data...');
      if (allInvoiceDetails.length > 0) {
        const normalizedData = await normalizeAndDeduplicateData(allInvoiceDetails);
        setExtractedItems(normalizedData);
      } else {
        setExtractedItems([]);
      }
      
      setProgress(100);
      setStatus('success');
      setCurrentFileProgress('Processing complete!');

    } catch (error) {
      console.error("Error processing files:", error);
      const message = error instanceof Error ? error.message : 'An unexpected error occurred during processing.';
      setErrorMessage(message);
      setStatus('error');
      setCurrentFileProgress('Processing failed.');
    }
  };

  return (
    <div className="container mx-auto px-4 py-8 md:px-8 md:py-12 flex-grow">
      <header className="mb-8 text-center">
        <h1 className="text-3xl md:text-4xl font-headline font-bold text-primary">PDF Data Extractor</h1>
        <p className="text-muted-foreground mt-2">
          Upload your PDF invoices to automatically extract product codes, names, quantities, and prices.
        </p>
      </header>

      <main className="space-y-8">
        <PdfUploadForm
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
        
        {status === 'idle' && extractedItems.length === 0 && selectedFiles.length === 0 && (
           <Alert className="my-6 bg-primary/5 border-primary/20">
            <Info className="h-4 w-4 text-primary" />
            <AlertTitle className="text-primary font-semibold">Get Started</AlertTitle>
            <AlertDescription className="text-primary/80">
              Upload one or more PDF files using the form above. The extracted data will appear in a table below.
            </AlertDescription>
          </Alert>
        )}

        {(status === 'success' || (status !== 'processing' && extractedItems.length > 0)) && (
          <div className="mt-8">
            <ActionButtons items={extractedItems} />
            <InvoiceDataTable items={extractedItems} />
          </div>
        )}

         {status === 'success' && extractedItems.length === 0 && (
           <Alert className="my-6">
            <Info className="h-4 w-4" />
            <AlertTitle>No Data Extracted</AlertTitle>
            <AlertDescription>
              Processing finished, but no invoice items were found in the uploaded PDFs. Please check your files or try different ones.
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
