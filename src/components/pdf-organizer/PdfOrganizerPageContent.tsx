
'use client';

import React, { useState, useCallback, ChangeEvent, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { UploadCloud, FileText, Download, AlertCircle, Info, FileEdit, CheckCircle, Edit3, FileArchive } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { readFileAsDataURL } from '@/lib/file-helpers';
import { suggestPdfFilename, type SuggestPdfFilenameOutput } from '@/ai/flows/suggest-pdf-filename';
import JSZip from 'jszip';

interface ProcessingResult extends SuggestPdfFilenameOutput {
  id: string;
  originalName: string;
  dataUri: string;
}

async function dataUriToBlob(dataUri: string): Promise<Blob> {
  const response = await fetch(dataUri);
  const blob = await response.blob();
  return blob;
}

export function PdfOrganizerPageContent() {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [processingResults, setProcessingResults] = useState<ProcessingResult[]>([]);
  const [editableFilenames, setEditableFilenames] = useState<Record<string, string>>({});
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [overallProgress, setOverallProgress] = useState(0);
  const [currentFileProgressText, setCurrentFileProgressText] = useState('');
  const [currentYear, setCurrentYear] = useState<string>('');

  useEffect(() => {
    setCurrentYear(new Date().getFullYear().toString());
  }, []);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files.length > 0) {
      const filesArray = Array.from(event.target.files).filter(file => file.type === 'application/pdf');
      if (filesArray.length !== event.target.files.length) {
        setErrorMessage('Some files were not PDFs and were ignored. Please select only PDF files.');
      } else {
        setErrorMessage(null);
      }
      setSelectedFiles(filesArray);
      setProcessingResults([]);
      setEditableFilenames({});
      setOverallProgress(0);
      setCurrentFileProgressText('');
    } else {
      setSelectedFiles([]);
      setErrorMessage(null);
    }
  };

  const handleProcessFiles = async () => {
    if (selectedFiles.length === 0) {
      setErrorMessage('Please select PDF file(s) to process.');
      return;
    }

    setIsProcessing(true);
    setErrorMessage(null);
    setProcessingResults([]);
    setEditableFilenames({});
    setOverallProgress(0);
    
    const results: ProcessingResult[] = [];
    const filenamesToEdit: Record<string, string> = {};

    for (let i = 0; i < selectedFiles.length; i++) {
      const file = selectedFiles[i];
      const fileId = `${file.name}-${file.lastModified}`;
      setCurrentFileProgressText(`Processing ${i + 1}/${selectedFiles.length}: ${file.name}`);
      let dataUri = '';
      try {
        dataUri = await readFileAsDataURL(file);
        const aiResult = await suggestPdfFilename({
          pdfDataUri: dataUri,
          originalFilename: file.name,
        });
        
        const resultEntry: ProcessingResult = {
          id: fileId,
          originalName: file.name,
          suggestedFilename: aiResult.suggestedFilename,
          extractedInvoiceNumber: aiResult.extractedInvoiceNumber,
          extractedSupplierName: aiResult.extractedSupplierName,
          extractedDate: aiResult.extractedDate,
          dataUri: dataUri,
        };
        results.push(resultEntry);
        filenamesToEdit[fileId] = aiResult.suggestedFilename;

      } catch (err) {
        console.error(`Error processing file ${file.name}:`, err);
        results.push({ 
            id: fileId, 
            originalName: file.name, 
            suggestedFilename: `Error_${file.name}`, 
            dataUri: dataUri, // Preserve the dataUri even on failure
            extractedDate: 'Error',
            extractedInvoiceNumber: undefined,
            extractedSupplierName: undefined,
        });
        filenamesToEdit[fileId] = `Error_${file.name}`;
        setErrorMessage((prev) => (prev ? `${prev}\n` : '') + `Failed to process ${file.name}.`);
      }
      setOverallProgress(Math.round(((i + 1) / selectedFiles.length) * 100));
    }

    setProcessingResults(results);
    setEditableFilenames(filenamesToEdit);
    setCurrentFileProgressText(results.length > 0 ? 'Processing complete!' : 'No files processed.');
    setIsProcessing(false);
  };

  const handleFilenameChange = (id: string, newName: string) => {
    setEditableFilenames(prev => ({ ...prev, [id]: newName }));
  };

  const handleDownloadAll = async () => {
    if (processingResults.length === 0 || !Object.keys(editableFilenames).length) return;

    if (processingResults.length === 1) {
      const result = processingResults[0];
      const filename = editableFilenames[result.id];
      if (result.dataUri && filename) {
        const a = document.createElement('a');
        a.href = result.dataUri;
        a.download = filename.endsWith('.pdf') ? filename : `${filename}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    } else {
      const zip = new JSZip();
      for (const result of processingResults) {
        if (result.dataUri && result.dataUri.startsWith('data:')) {
          try {
            const blob = await dataUriToBlob(result.dataUri);
            let filename = editableFilenames[result.id];
            if (!filename.toLowerCase().endsWith('.pdf')) {
              filename += '.pdf';
            }
            zip.file(filename, blob);
          } catch (error) {
            console.error(`Failed to add ${result.originalName} to ZIP:`, error);
            setErrorMessage((prev) => (prev ? `${prev}\n` : '') + `Could not add ${result.originalName} to ZIP.`);
          }
        }
      }
      try {
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(zipBlob);
        a.download = 'organized_pdfs.zip';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(a.href);
      } catch (error) {
         console.error('Failed to generate ZIP file:', error);
         setErrorMessage('Failed to generate ZIP file.');
      }
    }
  };
  
  const inputId = React.useId();

  return (
    <div className="container mx-auto px-4 py-8 md:px-8 md:py-12">
      <header className="mb-8 text-center">
        <h1 className="text-3xl md:text-4xl font-headline font-bold text-primary">PDF File Organizer</h1>
        <p className="text-muted-foreground mt-2">
          Upload PDFs to get suggested filenames. Download individually or as a ZIP with new, organized names.
        </p>
      </header>

      <main className="space-y-8">
        <Card className="w-full max-w-2xl mx-auto shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-headline">
              <UploadCloud className="w-6 h-6 text-primary" />
              Upload PDFs
            </CardTitle>
            <CardDescription>Select one or more PDF files to organize.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <label htmlFor={inputId} className="sr-only">Choose PDF files</label>
              <Input
                id={inputId}
                type="file"
                accept="application/pdf"
                multiple
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

            {selectedFiles.length > 0 && !isProcessing && (
              <div className="text-sm p-1.5 bg-secondary/50 rounded-md">
                Selected {selectedFiles.length} file(s).
              </div>
            )}

            <Button
              onClick={handleProcessFiles}
              disabled={isProcessing || selectedFiles.length === 0}
              className="w-full"
              size="lg"
            >
              {isProcessing ? 'Processing...' : `Suggest Filenames for ${selectedFiles.length} File(s)`}
            </Button>
          </CardContent>
        </Card>

        {isProcessing && (
          <div className="my-6 p-4 border rounded-lg shadow-sm bg-card">
            <Progress value={overallProgress} className="w-full mb-2" />
            <p className="text-sm text-center text-muted-foreground">{currentFileProgressText}</p>
          </div>
        )}

        {errorMessage && (
          <Alert variant="destructive" className="my-6 whitespace-pre-line">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{errorMessage}</AlertDescription>
          </Alert>
        )}

        {!isProcessing && selectedFiles.length === 0 && processingResults.length === 0 && (
           <Alert className="my-6 bg-primary/5 border-primary/20">
            <Info className="h-4 w-4 text-primary" />
            <AlertTitle className="text-primary font-semibold">Get Started</AlertTitle>
            <AlertDescription className="text-primary/80">
              Upload PDF files. The system will suggest new, organized filenames based on their content.
            </AlertDescription>
          </Alert>
        )}

        {processingResults.length > 0 && !isProcessing && (
          <div className="space-y-6">
            <Card className="shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 font-headline">
                  <CheckCircle className="w-6 h-6 text-green-500" />
                  Filename Suggestions Ready
                </CardTitle>
                <CardDescription>Review and edit filenames. Download individually or all as a ZIP.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {processingResults.map((result) => (
                  <Card key={result.id} className="p-4 border bg-background/50">
                    <p className="text-sm font-medium text-muted-foreground">Original: <span className="text-foreground break-all">{result.originalName}</span></p>
                    {result.extractedDate !== 'Error' && (result.extractedDate || result.extractedSupplierName || result.extractedInvoiceNumber) &&
                      <div className="mt-1 mb-2 border p-2 text-xs rounded-md bg-secondary/30">
                        <h4 className="text-xs font-semibold mb-0.5 text-primary/80">Extracted:</h4>
                        {result.extractedDate && <p>Date: {result.extractedDate}</p>}
                        {result.extractedSupplierName && <p>Supplier: {result.extractedSupplierName}</p>}
                        {result.extractedInvoiceNumber && <p>Invoice No: {result.extractedInvoiceNumber}</p>}
                      </div>
                    }
                    {result.extractedDate === 'Error' && 
                        <p className="text-xs text-destructive my-1">Could not process this file for details.</p>
                    }

                    <Label htmlFor={`suggested-name-${result.id}`} className="text-xs font-medium text-muted-foreground flex items-center gap-1 mt-1">
                        <Edit3 className="w-3 h-3" />
                        New Filename:
                    </Label>
                    <Input
                      id={`suggested-name-${result.id}`}
                      type="text"
                      value={editableFilenames[result.id] || ''}
                      onChange={(e) => handleFilenameChange(result.id, e.target.value)}
                      className="text-sm h-9 mt-0.5"
                      disabled={result.extractedDate === 'Error' && !result.dataUri}
                    />
                  </Card>
                ))}
              </CardContent>
              <CardFooter>
                <Button onClick={handleDownloadAll} className="w-full" size="lg" disabled={Object.keys(editableFilenames).length === 0}>
                  {processingResults.length > 1 ? <FileArchive className="mr-2 h-4 w-4" /> : <Download className="mr-2 h-4 w-4" />}
                  {processingResults.length > 1 ? `Download All as ZIP` : `Download with New Name`}
                </Button>
              </CardFooter>
            </Card>
          </div>
        )}
      </main>

      <footer className="text-center mt-12 py-4 border-t">
        <p className="text-sm text-muted-foreground">&copy; {currentYear} PDF Suite. Powered by AI.</p>
      </footer>
    </div>
  );
}

