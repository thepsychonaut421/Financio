
'use client';

import React, { useState, useCallback, ChangeEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label'; // Added import
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { UploadCloud, FileText, Download, AlertCircle, Info, FileEdit, CheckCircle, Edit3 } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { readFileAsDataURL } from '@/lib/file-helpers';
import { suggestPdfFilename, type SuggestPdfFilenameOutput } from '@/ai/flows/suggest-pdf-filename';

interface ProcessingResult extends SuggestPdfFilenameOutput {
  originalName: string;
  dataUri: string;
}

export default function PdfOrganizerPage() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [processingResult, setProcessingResult] = useState<ProcessingResult | null>(null);
  const [editableFilename, setEditableFilename] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [progressValue, setProgressValue] = useState(0);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      const file = event.target.files[0];
      if (file.type === 'application/pdf') {
        setSelectedFile(file);
        setProcessingResult(null);
        setEditableFilename('');
        setErrorMessage(null);
        setProgressValue(0);
      } else {
        setErrorMessage('Invalid file type. Please select a PDF file.');
        setSelectedFile(null);
      }
    }
  };

  const handleProcessFile = async () => {
    if (!selectedFile) {
      setErrorMessage('Please select a PDF file to process.');
      return;
    }

    setIsProcessing(true);
    setErrorMessage(null);
    setProcessingResult(null);
    setProgressValue(10);

    try {
      const dataUri = await readFileAsDataURL(selectedFile);
      setProgressValue(30);

      const aiResult = await suggestPdfFilename({
        pdfDataUri: dataUri,
        originalFilename: selectedFile.name,
      });
      setProgressValue(80);

      setProcessingResult({
        originalName: selectedFile.name,
        suggestedFilename: aiResult.suggestedFilename,
        extractedInvoiceNumber: aiResult.extractedInvoiceNumber,
        extractedSupplierName: aiResult.extractedSupplierName,
        extractedDate: aiResult.extractedDate,
        dataUri: dataUri,
      });
      setEditableFilename(aiResult.suggestedFilename);
      setProgressValue(100);

    } catch (err) {
      console.error('Error processing file:', err);
      const message = err instanceof Error ? err.message : 'An unknown error occurred during processing.';
      setErrorMessage(`Failed to process PDF: ${message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownload = () => {
    if (processingResult && processingResult.dataUri && editableFilename) {
      const a = document.createElement('a');
      a.href = processingResult.dataUri;
      a.download = editableFilename.endsWith('.pdf') ? editableFilename : `${editableFilename}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  };
  
  const inputId = React.useId();

  return (
    <div className="container mx-auto px-4 py-8 md:px-8 md:py-12">
      <header className="mb-8 text-center">
        <h1 className="text-3xl md:text-4xl font-headline font-bold text-primary">PDF File Organizer</h1>
        <p className="text-muted-foreground mt-2">
          Upload a PDF to get a suggested filename based on its content. Download it with the new, organized name.
        </p>
      </header>

      <main className="space-y-8">
        <Card className="w-full max-w-2xl mx-auto shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-headline">
              <UploadCloud className="w-6 h-6 text-primary" />
              Upload PDF
            </CardTitle>
            <CardDescription>Select a single PDF file to organize.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <label htmlFor={inputId} className="sr-only">Choose PDF file</label>
              <Input
                id={inputId}
                type="file"
                accept="application/pdf"
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

            {selectedFile && !isProcessing && (
              <div className="text-sm p-1.5 bg-secondary/50 rounded-md flex items-center gap-2">
                <FileText className="w-4 h-4 text-primary" />
                Selected: <span className="font-medium">{selectedFile.name}</span>
              </div>
            )}

            <Button
              onClick={handleProcessFile}
              disabled={isProcessing || !selectedFile}
              className="w-full"
              size="lg"
            >
              {isProcessing ? 'Processing...' : 'Suggest Filename'}
            </Button>
          </CardContent>
        </Card>

        {isProcessing && (
          <div className="my-6 p-4 border rounded-lg shadow-sm bg-card">
            <Progress value={progressValue} className="w-full mb-2" />
            <p className="text-sm text-center text-muted-foreground">Analyzing PDF and suggesting filename...</p>
          </div>
        )}

        {errorMessage && (
          <Alert variant="destructive" className="my-6">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Processing Error</AlertTitle>
            <AlertDescription>{errorMessage}</AlertDescription>
          </Alert>
        )}

        {!isProcessing && !selectedFile && !processingResult && (
           <Alert className="my-6 bg-primary/5 border-primary/20">
            <Info className="h-4 w-4 text-primary" />
            <AlertTitle className="text-primary font-semibold">Get Started</AlertTitle>
            <AlertDescription className="text-primary/80">
              Upload a PDF file using the form above. The system will analyze it and suggest a new, more organized filename.
            </AlertDescription>
          </Alert>
        )}

        {processingResult && !isProcessing && (
          <Card className="mt-8 shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 font-headline">
                <CheckCircle className="w-6 h-6 text-green-500" />
                Filename Suggestion Ready
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h3 className="text-sm font-medium text-muted-foreground">Original Filename:</h3>
                <p className="text-foreground p-2 bg-secondary/30 rounded-md break-all">{processingResult.originalName}</p>
              </div>
              
              { (processingResult.extractedDate || processingResult.extractedSupplierName || processingResult.extractedInvoiceNumber) &&
                <div className="border p-3 rounded-md bg-background/50">
                  <h4 className="text-sm font-semibold mb-1 text-primary">Extracted Details:</h4>
                  <ul className="text-xs space-y-0.5 text-muted-foreground">
                    {processingResult.extractedDate && <li>Date: {processingResult.extractedDate}</li>}
                    {processingResult.extractedSupplierName && <li>Supplier: {processingResult.extractedSupplierName}</li>}
                    {processingResult.extractedInvoiceNumber && <li>Invoice No: {processingResult.extractedInvoiceNumber}</li>}
                  </ul>
                </div>
              }


              <div>
                <Label htmlFor="suggested-name" className="text-sm font-medium text-muted-foreground flex items-center gap-1 mb-1">
                    <Edit3 className="w-4 h-4" />
                    Suggested New Filename (editable):
                </Label>
                <Input
                  id="suggested-name"
                  type="text"
                  value={editableFilename}
                  onChange={(e) => setEditableFilename(e.target.value)}
                  className="text-base"
                />
                 <p className="text-xs text-muted-foreground mt-1">Ensure the name ends with '.pdf'.</p>
              </div>

              <Button onClick={handleDownload} className="w-full" size="lg" disabled={!editableFilename.trim()}>
                <Download className="mr-2 h-4 w-4" />
                Download with New Name
              </Button>
            </CardContent>
          </Card>
        )}
      </main>

      <footer className="text-center mt-12 py-4 border-t">
        <p className="text-sm text-muted-foreground">&copy; {new Date().getFullYear()} PDF Suite. Powered by AI.</p>
      </footer>
    </div>
  );
}
