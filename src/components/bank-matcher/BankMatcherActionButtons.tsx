
'use client';

import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { 
  matchedTransactionsToCSV,
  matchedTransactionsToTSV,
  matchedTransactionsToJSON,
  downloadFile 
} from '@/lib/bank-matcher/exportMatchedTransactions';
import type { MatchedTransaction } from '@/lib/bank-matcher/types';
import { Copy, FileJson, FileSpreadsheet, DownloadCloud } from 'lucide-react';

interface BankMatcherActionButtonsProps {
  matchedTransactions: MatchedTransaction[];
}

export function BankMatcherActionButtons({ matchedTransactions }: BankMatcherActionButtonsProps) {
  const { toast } = useToast();

  const handleCopyToClipboard = async () => {
    if (matchedTransactions.length === 0) {
      toast({ title: "No data", description: "There are no matched transactions to copy.", variant: "destructive" });
      return;
    }
    
    const tsvData = matchedTransactionsToTSV(matchedTransactions);
    try {
      await navigator.clipboard.writeText(tsvData);
      toast({ title: "Copied to clipboard!", description: `Data for ${matchedTransactions.length} transaction(s) copied successfully.` });
    } catch (err) {
      toast({ title: "Copy failed", description: "Could not copy data to clipboard.", variant: "destructive" });
      console.error('Failed to copy: ', err);
    }
  };

  const handleExportJSON = () => {
    if (matchedTransactions.length === 0) {
      toast({ title: "No data", description: "There are no matched transactions to export.", variant: "destructive" });
      return;
    }
    const jsonData = matchedTransactionsToJSON(matchedTransactions); 
    const fileName = 'bank_matcher_results.json';
    downloadFile(jsonData, fileName, 'application/json;charset=utf-8;');
    toast({ title: "JSON Exported", description: `Data for ${matchedTransactions.length} transaction(s) exported to JSON.` });
  };

  const handleExportCSV = () => {
    if (matchedTransactions.length === 0) {
      toast({ title: "No data", description: "There are no matched transactions to export.", variant: "destructive" });
      return;
    }
    const csvData = matchedTransactionsToCSV(matchedTransactions);
    const fileName = 'bank_matcher_results.csv';
    
    downloadFile(csvData, fileName, 'text/csv;charset=utf-8;');
    toast({ title: "CSV Exported", description: `Data for ${matchedTransactions.length} transaction(s) exported to CSV.` });
  };

  if (matchedTransactions.length === 0) {
    return null;
  }

  return (
    <div className="my-6 flex flex-col sm:flex-row justify-center items-center gap-3 sm:gap-4">
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
    </div>
  );
}
