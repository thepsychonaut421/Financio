
'use client';

import React from 'react';
import { useIncomingInvoices } from '@/hooks/useIncomingInvoices.tsx';
import { IncomingInvoiceUploadForm } from '@/components/incoming-invoices/IncomingInvoiceUploadForm';
import { IncomingInvoiceCard } from '@/components/incoming-invoices/IncomingInvoiceCard';
import { ERPInvoiceTable } from '@/components/incoming-invoices/ERPInvoiceTable';
import { IncomingInvoiceActionButtons } from '@/components/incoming-invoices/IncomingInvoiceActionButtons';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle, Info, Settings2, FileCog } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import type { ERPIncomingInvoiceItem, IncomingInvoiceItem } from '@/types/incoming-invoice';
import { createInvoiceKey } from '@/lib/invoice-helpers';

const erpTableSortOptions = [
  { key: 'rechnungsnummer' as const, label: 'Invoice No.' },
  { key: 'datum' as const, label: 'Date' },
  { key: 'lieferantName' as const, label: 'Supplier' },
  { key: 'gesamtbetrag' as const, label: 'Total' },
  { key: 'pdfFileName' as const, label: 'PDF Name' },
];

type Props = { kind: 'purchase'|'sales' };


export function IncomingInvoicesPageContent({ kind }: Props) {
  const isSales = kind === 'sales';

  const {
    selectedFiles,
    status,
    progressValue,
    currentFileProgress,
    errorMessage,
    erpMode,
    isExportingToERPNext,
    isExportingSuppliers,
    isSubmittingItems,
    isExportingZip,
    currentYear,
    kontenrahmen,
    existingErpInvoiceKeys,
    erpSortKey,
    erpSortOrder,
    sortedErpProcessedInvoices,
    displayInvoices,
    setErpMode,
    handleFilesSelected,
    handleProcessFiles,
    handleRemoveFile,
    handleExportToERPNext,
    handleExportSuppliersERPNext,
    handleExportSuppliersCSV,
    handleSubmitItemsAPI,
    handleExportInvoicesAsZip,
    handleClearAllInvoices,
    handleErpSortRequest,
    setKontenrahmen,
  } = useIncomingInvoices(kind);


  return (
    <div className="container mx-auto px-4 py-8 md:px-8 md:py-12">
      <header className="mb-8 text-center">
        <h1 className="text-3xl md:text-4xl font-headline font-bold text-primary">
            {isSales ? 'Sales Invoices' : 'Purchase Invoices'}
        </h1>
        <p className="text-muted-foreground mt-2">
           {isSales
            ? 'Upload German PDF sales invoices (Ausgangsrechnungen) to extract comprehensive details. Switch to ERP Vorlage Mode for ERPNext-compatible data.'
            : 'Upload German PDF purchase invoices (Eingangsrechnungen) to extract comprehensive details. Switch to ERP Vorlage Mode for ERPNext-compatible data.'
           }
        </p>
      </header>
      
      <main className="space-y-8">
        <IncomingInvoiceUploadForm
          onFilesSelected={handleFilesSelected}
          onProcess={handleProcessFiles}
          isProcessing={status === 'processing'}
          selectedFileCount={selectedFiles.length}
          selectedFileNames={selectedFiles.map(f => f.name)}
          onRemoveFile={handleRemoveFile}
        />
        
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 p-4 bg-card border rounded-lg shadow-sm">
          <div className="flex items-center space-x-3">
            <Switch
              id="erp-mode-switch"
              checked={erpMode}
              onCheckedChange={setErpMode}
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
                  Default Accounts Payable/Receivable (Kontenrahmen)
                </Label>
                <Input
                  id="kontenrahmen-input"
                  value={kontenrahmen}
                  onChange={(e) => setKontenrahmen(e.target.value)}
                  placeholder={isSales ? "e.g., 10000 - Debtors" : "e.g., 20000 - Creditors"}
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
              (displayInvoices as IncomingInvoiceItem[]).map((invoice, index) => (
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
