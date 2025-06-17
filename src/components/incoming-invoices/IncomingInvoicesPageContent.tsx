
'use client';

import React, { useState, useCallback } from 'react';
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
import { differenceInDays, addDays, parseISO } from 'date-fns';


export function IncomingInvoicesPageContent() {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [extractedInvoices, setExtractedInvoices] = useState<IncomingInvoiceItem[]>([]);
  const [erpProcessedInvoices, setErpProcessedInvoices] = useState<ERPIncomingInvoiceItem[]>([]);
  const [status, setStatus] = useState<IncomingProcessingStatus>('idle');
  const [progressValue, setProgressValue] = useState(0);
  const [currentFileProgress, setCurrentFileProgress] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [erpMode, setErpMode] = useState(false);
  const [useMinimalErpExport, setUseMinimalErpExport] = useState(true);

  // Updated supplierMap based on user prompt
  const supplierMap: Record<string, string> = {
    "LIDL": "Lidl",
    "Lidl Digital Deutschland GmbH & Co. KG": "Lidl",
    "Lidl Digital International GmbH & Co. KG": "Lidl", // Added from existing
    "GD Artlands eTrading GmbH": "GD Artlands eTrading GmbH",
    "RETOURA": "RETOURA",
    "RETOURA GmbH": "RETOURA", // Added from existing
    "doitBau GmbH & Co.KG": "doitBau",
    "Kaufland": "Kaufland",
    "ALDI": "ALDI E-Commerce", // User specified "ALDI E-Commerce" for ALDI
    "ALDI E-Commerce GmbH & Co. KG": "ALDI E-Commerce", // ALDI mapping
    "FIRMA HANDLOWA KABIS BOZENA KEDZIORA": "FIRMA HANDLOWA KABIS BOZENA KEDZIORA",
    "Zweco UG": "Zweco UG",
    "Baluata, Bayer Rem Ug": "BAYER REM UG", // From existing, user did not list it
  };

  // Simplified Kontenrahmen - default for all
  const DEFAULT_KONTENRAHMEN = "1740 - Verbindlichkeiten";

  const formatDateForERP = (dateString?: string): string | undefined => {
    if (!dateString) return undefined;
    // Try YYYY-MM-DD first (AI should return this)
    if (dateString.match(/^\d{4}-\d{2}-\d{2}$/)) {
        return dateString;
    }
    // Try DD.MM.YYYY
    const datePartsDDMMYYYY = dateString.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
    if (datePartsDDMMYYYY && datePartsDDMMYYYY[3] && datePartsDDMMYYYY[2] && datePartsDDMMYYYY[1]) {
        return `${datePartsDDMMYYYY[3]}-${datePartsDDMMYYYY[2]}-${datePartsDDMMYYYY[1]}`;
    }
    // Fallback: try to parse with Date constructor
    try {
        const d = new Date(dateString);
        if (!isNaN(d.getTime())) {
             return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        }
    } catch (e) { /* ignore */ }
    return dateString; // Return original if all parsing fails
  };

  const calculateDueDate = (invoiceDateStr?: string, paymentTerm?: string): string | undefined => {
    if (!invoiceDateStr || !paymentTerm) return invoiceDateStr; // Return invoice date if no term
    
    const invoiceDate = parseISO(invoiceDateStr); // Expects YYYY-MM-DD
    if (isNaN(invoiceDate.getTime())) return invoiceDateStr; // Invalid invoice date

    const termLower = paymentTerm.toLowerCase();

    if (termLower.includes("sofort") || termLower.includes("immediately")) {
      return invoiceDateStr;
    }

    const daysMatch = termLower.match(/(\d+)\s*tage/); // e.g., "14 Tage"
    if (daysMatch && daysMatch[1]) {
      const days = parseInt(daysMatch[1], 10);
      if (!isNaN(days)) {
        const dueDate = addDays(invoiceDate, days);
        return `${dueDate.getFullYear()}-${String(dueDate.getMonth() + 1).padStart(2, '0')}-${String(dueDate.getDate()).padStart(2, '0')}`;
      }
    }
    return invoiceDateStr; // Fallback to invoice date if term not parsable
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

  const resetStateOnModeChange = () => {
    if (extractedInvoices.length > 0 || erpProcessedInvoices.length > 0 || selectedFiles.length > 0) {
      setSelectedFiles([]);
      setExtractedInvoices([]);
      setErpProcessedInvoices([]);
      setStatus('idle');
      setCurrentFileProgress('');
      setProgressValue(0);
      setErrorMessage(null);
    }
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
    const regularResults: IncomingInvoiceItem[] = [];
    const erpResults: ERPIncomingInvoiceItem[] = [];
    const yearCounters: Record<string, number> = {}; // For generating ACC-PINV-YYYY-NNNNN

    try {
      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];
        setCurrentFileProgress(`Processing file ${i + 1} of ${selectedFiles.length}: ${file.name}`);
        
        const dataUri = await readFileAsDataURL(file);
        const aiResult: ExtractIncomingInvoiceDataOutput = await extractIncomingInvoiceData({ invoiceDataUri: dataUri });
        
        const baseExtractedData: IncomingInvoiceItem = {
          pdfFileName: file.name,
          rechnungsnummer: aiResult.rechnungsnummer,
          datum: aiResult.datum, // AI should provide YYYY-MM-DD
          lieferantName: aiResult.lieferantName, // AI attempts mapping or returns original/UNBEKANNT
          lieferantAdresse: aiResult.lieferantAdresse,
          zahlungsziel: aiResult.zahlungsziel,
          zahlungsart: aiResult.zahlungsart,
          gesamtbetrag: aiResult.gesamtbetrag,
          mwstSatz: aiResult.mwstSatz,
          rechnungspositionen: aiResult.rechnungspositionen || [],
          kundenNummer: aiResult.kundenNummer,
          bestellNummer: aiResult.bestellNummer,
          isPaidByAI: aiResult.isPaid,
        };
        
        if (!erpMode) {
          regularResults.push(baseExtractedData);
        }

        if (erpMode) {
          // Resolve Lieferant Name using the map if AI returned something generic or needs mapping
          let finalLieferantName = aiResult.lieferantName; // Default to AI's output
          if (aiResult.lieferantName && supplierMap[aiResult.lieferantName.toUpperCase()]) { // Check map using uppercase for robustness
            finalLieferantName = supplierMap[aiResult.lieferantName.toUpperCase()];
          } else if (aiResult.lieferantName && Object.values(supplierMap).includes(aiResult.lieferantName)) {
            // AI might have directly returned a valid ERPNext name
            finalLieferantName = aiResult.lieferantName;
          } else if (aiResult.lieferantName) {
             // Attempt partial match for common variations if AI didn't map
            const foundKey = Object.keys(supplierMap).find(key => aiResult.lieferantName?.toLowerCase().includes(key.toLowerCase()));
            if (foundKey) {
                finalLieferantName = supplierMap[foundKey];
            } else {
                // If still no match, and AI returned "UNBEKANNT", keep it. Otherwise, use AI's extraction.
                // If AI didn't return UNBEKANNT but we can't map, we might want to flag it. For now, use AI's value or UNBEKANNT.
                finalLieferantName = (aiResult.lieferantName === "UNBEKANNT" || !aiResult.lieferantName) ? "UNBEKANNT" : aiResult.lieferantName;
            }
          } else {
            finalLieferantName = "UNBEKANNT";
          }


          const postingDateERP = formatDateForERP(aiResult.datum);
          const dueDateERP = calculateDueDate(postingDateERP, aiResult.zahlungsziel);
          
          let remarks = '';
          if (aiResult.kundenNummer) remarks += `Kunden-Nr.: ${aiResult.kundenNummer}`;
          if (aiResult.bestellNummer) remarks += `${remarks ? ' / ' : ''}Bestell-Nr.: ${aiResult.bestellNummer}`;

          let istBezahltStatus: 0 | 1 = 0; // Default to Not Paid
          const zahlungszielLower = (aiResult.zahlungsziel || '').toLowerCase();
          const zahlungsartLower = (aiResult.zahlungsart || '').toLowerCase();

          if (aiResult.isPaid === true) { // AI explicitly identified "Bezahlt"
            istBezahltStatus = 1;
          } else if (zahlungszielLower.includes('sofort') || zahlungsartLower === 'sofort' || zahlungsartLower === 'lastschrift' || zahlungsartLower.includes('paypal')) {
            istBezahltStatus = 1;
          }
          
          const erpInvoice: ERPIncomingInvoiceItem = { 
            ...baseExtractedData,
            lieferantName: finalLieferantName === "UNBEKANNT" ? baseExtractedData.lieferantName : finalLieferantName, // Use original if mapped to UNBEKANNT
            datum: postingDateERP, 
            billDate: postingDateERP, // For ERPNext 'Complete'
            dueDate: dueDateERP,     // For ERPNext 'Complete'
            wahrung: 'EUR', 
            istBezahlt: istBezahltStatus, // For ERPNext 'Complete'
            kontenrahmen: DEFAULT_KONTENRAHMEN, // For ERPNext 'Complete'
            remarks: remarks.trim(), // For ERPNext 'Complete'
          };
          
          let year = new Date().getFullYear().toString();
          if (postingDateERP) {
              year = postingDateERP.substring(0,4);
          }
            
          if (!yearCounters[year]) {
            yearCounters[year] = 0;
          }
          yearCounters[year]++;
          erpInvoice.erpNextInvoiceName = `ACC-PINV-${year}-${String(yearCounters[year]).padStart(5, '0')}`;
          
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
              Upload one or more PDF files. Extracted details for each invoice will be shown below. Toggle ERP Vorlage Mode for ERPNext specific processing.
            </AlertDescription>
          </Alert>
        )}

        {(status === 'success' || (status !== 'processing' && displayInvoices.length > 0)) && (
          <div className="mt-8 space-y-6">
            <IncomingInvoiceActionButtons 
              invoices={displayInvoices} 
              erpMode={erpMode}
              useMinimalErpExport={useMinimalErpExport} 
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

    