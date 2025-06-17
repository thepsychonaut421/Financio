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
import { ArrowUpDown, ListOrdered } from 'lucide-react';
import type { ExtractedItem } from '@/types/invoice';

interface InvoiceDataTableProps {
  items: ExtractedItem[];
}

type SortKey = keyof ExtractedItem | null;
type SortOrder = 'asc' | 'desc';

export function InvoiceDataTable({ items }: InvoiceDataTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>(null);
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');

  const sortedItems = useMemo(() => {
    if (!sortKey) return items;
    return [...items].sort((a, b) => {
      const valA = a[sortKey];
      const valB = b[sortKey];

      let comparison = 0;
      if (typeof valA === 'number' && typeof valB === 'number') {
        comparison = valA - valB;
      } else if (typeof valA === 'string' && typeof valB === 'string') {
        comparison = valA.localeCompare(valB);
      }

      return sortOrder === 'asc' ? comparison : -comparison;
    });
  }, [items, sortKey, sortOrder]);

  const requestSort = (key: keyof ExtractedItem) => {
    let direction: SortOrder = 'asc';
    if (sortKey === key && sortOrder === 'asc') {
      direction = 'desc';
    }
    setSortKey(key);
    setSortOrder(direction);
  };

  const getSortIndicator = (key: keyof ExtractedItem) => {
    if (sortKey !== key) return <ArrowUpDown className="ml-2 h-4 w-4 opacity-50" />;
    return sortOrder === 'asc' ? <ArrowUpDown className="ml-2 h-4 w-4 text-primary" data-testid="sort-asc" /> : <ArrowUpDown className="ml-2 h-4 w-4 text-primary" data-testid="sort-desc"/>;
  };
  
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value); // Assuming USD, adjust as needed
  }

  if (!items || items.length === 0) {
    return (
      <Card className="mt-8 shadow-lg">
        <CardHeader>
          <CardTitle className="font-headline">Extracted Data</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-center py-8">No data extracted yet. Upload PDF files to see results.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mt-8 shadow-lg">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-headline">
          <ListOrdered className="w-6 h-6 text-primary" />
          Extracted Invoice Data
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableCaption>A list of all extracted invoice items.</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>
                  <Button variant="ghost" onClick={() => requestSort('productCode')} className="px-1 py-1 h-auto">
                    Product Code {getSortIndicator('productCode')}
                  </Button>
                </TableHead>
                <TableHead>
                  <Button variant="ghost" onClick={() => requestSort('productName')} className="px-1 py-1 h-auto">
                    Product Name {getSortIndicator('productName')}
                  </Button>
                </TableHead>
                <TableHead className="text-right">
                  <Button variant="ghost" onClick={() => requestSort('quantity')} className="px-1 py-1 h-auto">
                    Quantity {getSortIndicator('quantity')}
                  </Button>
                </TableHead>
                <TableHead className="text-right">
                   <Button variant="ghost" onClick={() => requestSort('unitPrice')} className="px-1 py-1 h-auto">
                    Unit Price {getSortIndicator('unitPrice')}
                  </Button>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedItems.map((item, index) => (
                <TableRow key={`${item.productCode}-${index}`} className="hover:bg-accent/20">
                  <TableCell className="font-medium">{item.productCode}</TableCell>
                  <TableCell>{item.productName}</TableCell>
                  <TableCell className="text-right">{item.quantity}</TableCell>
                  <TableCell className="text-right">{formatCurrency(item.unitPrice)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
