
'use client';

import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { 
  bankTransactionsToCSV,
  bankTransactionsToTSV,
  bankTransactionsToJSON,
  bankTransactionsToERPNextBankRecCSV, // Added new export function
  downloadFile 
} from '@/lib/exportBankStatementData'; 
import type { BankTransactionAI } from '@/ai/flows/extract-bank-statement-data';
import { Copy, FileJson, FileSpreadsheet, Landmark } from 'lucide-react'; // Added Landmark

interface BankStatementActionButtonsProps {
  transactions: BankTransactionAI[];
}

export function BankStatementActionButtons({ transactions }: BankStatementActionButtonsProps) {
  const { toast } = useToast();

  const handleCopyToClipboard = async () => {
    if (transactions.length === 0) {
      toast({ title: "No data", description: "There are no transactions to copy.", variant: "destructive" });
      return;
    }
    
    const tsvData = bankTransactionsToTSV(transactions);
    try {
      await navigator.clipboard.writeText(tsvData);
      toast({ title: "Copied to clipboard!", description: `Data for ${transactions.length} transaction(s) copied successfully.` });
    } catch (err) {
      toast({ title: "Copy failed", description: "Could not copy data to clipboard.", variant: "destructive" });
      console.error('Failed to copy: ', err);
    }
  };

  const handleExportJSON = () => {
    if (transactions.length === 0) {
      toast({ title: "No data", description: "There are no transactions to export.", variant: "destructive" });
      return;
    }
    const jsonData = bankTransactionsToJSON(transactions); 
    const fileName = 'extracted_bank_transactions.json';
    downloadFile(jsonData, fileName, 'application/json;charset=utf-8;');
    toast({ title: "JSON Exported", description: `Data for ${transactions.length} transaction(s) exported to JSON.` });
  };

  const handleExportCSV = () => {
    if (transactions.length === 0) {
      toast({ title: "No data", description: "There are no transactions to export.", variant: "destructive" });
      return;
    }
    const csvData = bankTransactionsToCSV(transactions);
    const fileName = 'extracted_bank_transactions.csv';
    
    downloadFile(csvData, fileName, 'text/csv;charset=utf-8;');
    toast({ title: "CSV Exported", description: `Data for ${transactions.length} transaction(s) exported to CSV.` });
  };

  const handleExportERPNextBankRec = () => {
    if (transactions.length === 0) {
      toast({ title: "No data", description: "There are no transactions to export for ERPNext Bank Rec.", variant: "destructive" });
      return;
    }
    const csvData = bankTransactionsToERPNextBankRecCSV(transactions);
    const fileName = 'erpnext_bank_reconciliation.csv';
    downloadFile(csvData, fileName, 'text/csv;charset=utf-8;');
    toast({ title: "ERPNext Bank Rec. CSV Exported", description: `Data for ${transactions.length} transaction(s) exported.` });
  };

  if (transactions.length === 0) {
    return null;
  }

  return (
    <div className="my-6 flex flex-col sm:flex-row flex-wrap justify-center items-center gap-3 sm:gap-4">
      <Button onClick={handleCopyToClipboard} variant="outline" className="w-full sm:w-auto">
        <Copy className="mr-2 h-4 w-4" />
        Copy All (TSV)
      </Button>
      <Button onClick={handleExportJSON} variant="outline" className="w-full sm:w-auto">
        <FileJson className="mr-2 h-4 w-4" />
        Export All as JSON
      </Button>
      <Button onClick={handleExportCSV} className="w-full sm:w-auto">
        <FileSpreadsheet className="mr-2 h-4 w-4" />
        Export All as CSV
      </Button>
      <Button onClick={handleExportERPNextBankRec} variant="secondary" className="w-full sm:w-auto">
        <Landmark className="mr-2 h-4 w-4" />
        Export ERPNext Bank Rec.
      </Button>
    </div>
  );
}
