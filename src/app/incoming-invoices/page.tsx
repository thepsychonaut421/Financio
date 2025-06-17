
'use client';

import React, { useState, useCallback } from 'react';
import { IncomingInvoiceUploadForm } from '@/components/incoming-invoices/IncomingInvoiceUploadForm';
import { IncomingInvoiceCard } from '@/components/incoming-invoices/IncomingInvoiceCard';
import { ERPInvoiceTable } from '@/components/incoming-invoices/ERPInvoiceTable';
import { IncomingInvoiceActionButtons } from '@/components/incoming-invoices/IncomingInvoiceActionButtons';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle, Info, Settings2 } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { readFileAsDataURL } from '@/lib/file-helpers';
import { extractIncomingInvoiceData, ExtractIncomingInvoiceDataOutput } from '@/ai/flows/extract-incoming-invoice-data';
import type { IncomingInvoiceItem, ERPIncomingInvoiceItem, IncomingProcessingStatus } from '@/types/incoming-invoice';

export default function IncomingInvoicesPage() {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [extractedInvoices, setExtractedInvoices] = useState<IncomingInvoiceItem[]>([]);
  const [erpProcessedInvoices, setErpProcessedInvoices] = useState<ERPIncomingInvoiceItem[]>([]);
  const [status, setStatus] = useState<IncomingProcessingStatus>('idle');
  const [progressValue, setProgressValue] = useState(0);
  const [currentFileProgress, setCurrentFileProgress] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [erpMode, setErpMode] = useState(false);

  const supplierMap: Record<string, string> = {
    "ALDI E-Commerce GmbH & Co. KG": "ALDI",
    "Baluata, Bayer Rem Ug": "BAYER REM UG",
    "RETOURA GmbH": "RETOURA",
    // Add more known long names to their ERP short names here
  };

  const handleFilesSelected = useCallback((files: File[]) => {
    setSelectedFiles(files);
    setExtractedInvoices([]); 
    setErpProcessedInvoices([]);
    setStatus('idle');
    setErrorMessage(null);
    setProgressValue(0);
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
    setProgressValue(0);
    const regularResults: IncomingInvoiceItem[] = [];
    const erpResults: ERPIncomingInvoiceItem[] = [];
    const yearCounters: Record<string, number> = {};

    try {
      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];
        setCurrentFileProgress(`Processing file ${i + 1} of ${selectedFiles.length}: ${file.name}`);
        
        const dataUri = await readFileAsDataURL(file);
        const extractionResult: ExtractIncomingInvoiceDataOutput = await extractIncomingInvoiceData({ invoiceDataUri: dataUri });
        
        const baseExtractedData = {
          pdfFileName: file.name,
          rechnungsnummer: extractionResult.rechnungsnummer,
          datum: extractionResult.datum,
          lieferantAdresse: extractionResult.lieferantAdresse,
          zahlungsziel: extractionResult.zahlungsziel,
          zahlungsart: extractionResult.zahlungsart,
          gesamtbetrag: extractionResult.gesamtbetrag,
          mwstSatz: extractionResult.mwstSatz,
          rechnungspositionen: extractionResult.rechnungspositionen || [],
        };
        
        if (!erpMode) {
          regularResults.push({
            ...baseExtractedData,
            lieferantName: extractionResult.lieferantName, // Original name for non-ERP mode
          });
        }

        if (erpMode) {
          let finalLieferantName = extractionResult.lieferantName;
          if (extractionResult.lieferantName && supplierMap[extractionResult.lieferantName]) {
            finalLieferantName = supplierMap[extractionResult.lieferantName];
          }

          const erpInvoice: ERPIncomingInvoiceItem = { 
            ...baseExtractedData,
            lieferantName: finalLieferantName, // Normalized or original supplier name
            wahrung: 'EUR', 
          };

          if (extractionResult.datum) {
            const dateParts = extractionResult.datum.match(/(\d{2})\.(\d{2})\.(\d{4})/); 
            let year = new Date().getFullYear().toString();
            if (dateParts && dateParts[3]) {
              year = dateParts[3];
            } else if (extractionResult.datum.match(/^\d{4}-\d{2}-\d{2}$/)) { 
                year = extractionResult.datum.substring(0,4);
            }
            
            if (!yearCounters[year]) {
              yearCounters[year] = 0;
            }
            yearCounters[year]++;
            erpInvoice.erpNextInvoiceName = `ACC-PINV-${year}-${String(yearCounters[year]).padStart(5, '0')}`;
          } else {
            const currentYear = new Date().getFullYear().toString();
            if (!yearCounters[currentYear]) yearCounters[currentYear] = 0;
            yearCounters[currentYear]++;
            erpInvoice.erpNextInvoiceName = `ACC-PINV-${currentYear}-${String(yearCounters[currentYear]).padStart(5, '0')}`;
          }

          const zahlungszielLower = (extractionResult.zahlungsziel || '').toLowerCase();
          const zahlungsartLower = (extractionResult.zahlungsart || '').toLowerCase();
          erpInvoice.istBezahlt = (
            zahlungszielLower.includes('sofort') || 
            zahlungsartLower === 'sofort' || 
            zahlungsartLower === 'lastschrift'
          ) ? 1 : 0;
          
          if (finalLieferantName && finalLieferantName.toLowerCase().includes('lidl')) {
            erpInvoice.kontenrahmen = '1740 - Verbindlichkeiten';
          } else if (finalLieferantName && finalLieferantName.toLowerCase().includes('aldi')) {
             erpInvoice.kontenrahmen = '1740 - Verbindlichkeiten'; // Example, adjust as needed
          }
          else {
            erpInvoice.kontenrahmen = ''; 
          }
          erpResults.push(erpInvoice);
        }
        
        setProgressValue(Math.round(((i + 1) / selectedFiles.length) * 100));
      }
      
      setExtractedInvoices(regularResults);
      setErpProcessedInvoices(erpResults);
      
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

        <div className="flex items-center justify-center space-x-3 p-4 bg-card border rounded-lg shadow-sm">
          <Switch
            id="erp-mode-switch"
            checked={erpMode}
            onCheckedChange={(checked) => {
              setErpMode(checked);
              if (status === 'success' || extractedInvoices.length > 0 || erpProcessedInvoices.length > 0) {
                 setSelectedFiles([]); 
                 setExtractedInvoices([]);
                 setErpProcessedInvoices([]);
                 setStatus('idle');
                 setCurrentFileProgress('');
                 setProgressValue(0);
              }
            }}
            disabled={status === 'processing'}
          />
          <Label htmlFor="erp-mode-switch" className="text-base font-medium">
            ERP Vorlage Mode
          </Label>
          <Settings2 className="h-5 w-5 text-muted-foreground" />
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
              Upload one or more PDF files. Extracted details for each invoice will be shown below.
            </AlertDescription>
          </Alert>
        )}

        {(status === 'success' || (status !== 'processing' && displayInvoices.length > 0)) && (
          <div className="mt-8 space-y-6">
            <IncomingInvoiceActionButtons 
              invoices={displayInvoices} 
              erpMode={erpMode} 
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

         {status === 'success' && displayInvoices.length === 0 && (
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
        <p className="text-sm text-muted-foreground">&copy; {new Date().getFullYear()} PDF Data Extractor. Powered by AI.</p>
      </footer>
    </div>
  );
}
    
