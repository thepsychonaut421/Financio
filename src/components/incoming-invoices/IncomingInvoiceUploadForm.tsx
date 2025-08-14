
'use client';

import React, { useState, ChangeEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { UploadCloud, FileText, XCircle } from 'lucide-react';

interface IncomingInvoiceUploadFormProps {
  onFilesSelected: (files: File[]) => void;
  onProcess: () => void;
  isProcessing: boolean;
  selectedFileCount: number;
}

export function IncomingInvoiceUploadForm({ onFilesSelected, onProcess, isProcessing, selectedFileCount }: IncomingInvoiceUploadFormProps) {
  const [currentFiles, setCurrentFiles] = useState<File[]>([]);
  const inputId = React.useId();

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      const newFiles = Array.from(event.target.files).filter(file => file.type === 'application/pdf');
      if (newFiles.length !== event.target.files.length) {
        // Silently filter, or add a toast notification if you prefer
      }
      setCurrentFiles(newFiles);
      onFilesSelected(newFiles);
    }
  };
  
  const handleRemoveFile = (fileName: string) => {
    const updatedFiles = currentFiles.filter(file => file.name !== fileName);
    setCurrentFiles(updatedFiles);
    onFilesSelected(updatedFiles);
  };

  return (
    <Card className="w-full max-w-2xl mx-auto shadow-lg">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-headline">
          <UploadCloud className="w-6 h-6 text-primary" />
          Upload Incoming Invoices (PDF)
        </CardTitle>
        <CardDescription>Select one or more PDF files (Eingangsrechnungen) to extract full details.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <label htmlFor={inputId} className="sr-only">Choose PDF files</label>
          <Input
            id={inputId}
            type="file"
            multiple
            accept="application/pdf"
            onChange={handleFileChange}
            disabled={isProcessing}
            className="block w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20"
          />
        </div>

        {currentFiles.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-foreground">Selected Files:</h3>
            <ul className="max-h-40 overflow-y-auto space-y-1 rounded-md border p-2">
              {currentFiles.map((file) => (
                <li key={file.name + file.lastModified} className="flex items-center justify-between text-sm p-1.5 bg-secondary/50 rounded-md">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-primary" />
                    <span className="truncate max-w-xs" title={file.name}>{file.name}</span>
                  </div>
                  {!isProcessing && (
                     <Button variant="ghost" size="sm" onClick={() => handleRemoveFile(file.name)} aria-label={`Remove ${file.name}`}>
                        <XCircle className="w-4 h-4 text-destructive" />
                     </Button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        <Button
          onClick={onProcess}
          disabled={isProcessing || selectedFileCount === 0}
          className="w-full"
          size="lg"
        >
          {isProcessing ? 'Processing...' : `Process ${selectedFileCount} File${selectedFileCount === 1 ? '' : 's'}`}
        </Button>
      </CardContent>
    </Card>
  );
}

    