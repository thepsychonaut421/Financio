
'use client';

import React, { useState, useMemo } from 'react';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableCaption,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowUpDown, FileText } from 'lucide-react';
import type { BankTransactionAI } from '@/ai/flows/extract-bank-statement-data';

interface BankStatementDataTableProps {
  transactions: BankTransactionAI[];
}

type SortKey = keyof BankTransactionAI | null;
type SortOrder = 'asc' | 'desc';

export function BankStatementDataTable({ transactions }: BankStatementDataTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('date'); // Default sort by date
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc'); // Default descending

  const sortedTransactions = useMemo(() => {
    if (!sortKey) return transactions;
    return [...transactions].sort((a, b) => {
      const valA = a[sortKey];
      const valB = b[sortKey];

      let comparison = 0;
      if (typeof valA === 'number' && typeof valB === 'number') {
        comparison = valA - valB;
      } else if (typeof valA === 'string' && typeof valB === 'string') {
        comparison = valA.localeCompare(valB);
      } else if (valA instanceof Date && valB instanceof Date) {
        comparison = valA.getTime() - valB.getTime();
      }

      return sortOrder === 'asc' ? comparison : -comparison;
    });
  }, [transactions, sortKey, sortOrder]);

  const requestSort = (key: keyof BankTransactionAI) => {
    let direction: SortOrder = 'asc';
    if (sortKey === key && sortOrder === 'asc') {
      direction = 'desc';
    }
    setSortKey(key);
    setSortOrder(direction);
  };

  const getSortIndicator = (key: keyof BankTransactionAI) => {
    if (sortKey !== key) return <ArrowUpDown className="ml-2 h-4 w-4 opacity-50" />;
    return sortOrder === 'asc' ? <ArrowUpDown className="ml-2 h-4 w-4 text-primary" data-testid="sort-asc" /> : <ArrowUpDown className="ml-2 h-4 w-4 text-primary" data-testid="sort-desc"/>;
  };
  
  const formatCurrency = (value: number, currency?: string) => {
    return new Intl.NumberFormat('de-DE', { style: 'currency', currency: currency || 'EUR' }).format(value);
  }

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleDateString('de-DE', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
    } catch (e) {
      return dateString; // Fallback if date is not parsable
    }
  };


  if (!transactions || transactions.length === 0) {
    return (
      <Card className="mt-8 shadow-lg">
        <CardHeader>
          <CardTitle className="font-headline flex items-center gap-2">
            <FileText className="w-6 h-6 text-primary" />
            Extracted Transactions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-center py-8">No transactions extracted yet. Upload PDF bank statements to see results.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mt-8 shadow-lg">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-headline">
          <FileText className="w-6 h-6 text-primary" />
          Extracted Bank Transactions
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableCaption>A list of all extracted bank transactions.</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>
                  <Button variant="ghost" onClick={() => requestSort('date')} className="px-1 py-1 h-auto">
                    Date {getSortIndicator('date')}
                  </Button>
                </TableHead>
                <TableHead>
                  <Button variant="ghost" onClick={() => requestSort('description')} className="px-1 py-1 h-auto">
                    Description {getSortIndicator('description')}
                  </Button>
                </TableHead>
                <TableHead>
                  <Button variant="ghost" onClick={() => requestSort('recipientOrPayer')} className="px-1 py-1 h-auto">
                    Recipient/Payer {getSortIndicator('recipientOrPayer')}
                  </Button>
                </TableHead>
                <TableHead className="text-right">
                  <Button variant="ghost" onClick={() => requestSort('amount')} className="px-1 py-1 h-auto">
                    Amount {getSortIndicator('amount')}
                  </Button>
                </TableHead>
                <TableHead className="text-center">
                   <Button variant="ghost" onClick={() => requestSort('currency')} className="px-1 py-1 h-auto">
                    Currency {getSortIndicator('currency')}
                  </Button>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedTransactions.map((tx) => (
                <TableRow key={tx.id} className="hover:bg-accent/20">
                  <TableCell>{formatDate(tx.date)}</TableCell>
                  <TableCell className="max-w-xs truncate" title={tx.description}>{tx.description}</TableCell>
                  <TableCell className="max-w-xs truncate" title={tx.recipientOrPayer}>{tx.recipientOrPayer}</TableCell>
                  <TableCell className={`text-right font-medium ${tx.amount < 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {formatCurrency(tx.amount, tx.currency)}
                  </TableCell>
                  <TableCell className="text-center">{tx.currency}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
