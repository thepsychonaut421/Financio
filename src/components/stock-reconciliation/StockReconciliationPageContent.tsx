
'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Info, PackageCheck, Search, ArrowUpDown } from 'lucide-react';
import type { ERPIncomingInvoiceItem } from '@/types/incoming-invoice';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

const LOCAL_STORAGE_MATCHER_DATA_KEY = 'processedIncomingInvoicesForMatcher';

interface StockItem {
    productCode: string;
    productName: string;
    totalQuantity: number;
    sourceInvoices: string[];
}

type SortKey = keyof StockItem | null;
type SortOrder = 'asc' | 'desc';

export function StockReconciliationPageContent() {
    const [stockItems, setStockItems] = useState<StockItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [currentYear, setCurrentYear] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [sortKey, setSortKey] = useState<SortKey>('productName');
    const [sortOrder, setSortOrder] = useState<SortOrder>('asc');

    useEffect(() => {
        setCurrentYear(new Date().getFullYear().toString());
        try {
            const storedInvoicesString = localStorage.getItem(LOCAL_STORAGE_MATCHER_DATA_KEY);
            if (storedInvoicesString) {
                const invoices: ERPIncomingInvoiceItem[] = JSON.parse(storedInvoicesString);
                const itemMap = new Map<string, StockItem>();

                invoices.forEach(invoice => {
                    (invoice.rechnungspositionen || []).forEach(lineItem => {
                        if (!lineItem.productCode) return; // Skip items without a product code

                        const existing = itemMap.get(lineItem.productCode);
                        if (existing) {
                            existing.totalQuantity += lineItem.quantity || 0;
                            if (invoice.rechnungsnummer || invoice.pdfFileName) {
                                existing.sourceInvoices.push(invoice.rechnungsnummer || invoice.pdfFileName);
                            }
                        } else {
                            itemMap.set(lineItem.productCode, {
                                productCode: lineItem.productCode,
                                productName: lineItem.productName,
                                totalQuantity: lineItem.quantity || 0,
                                sourceInvoices: [(invoice.rechnungsnummer || invoice.pdfFileName)].filter(Boolean) as string[],
                            });
                        }
                    });
                });
                
                const allItems = Array.from(itemMap.values());
                setStockItems(allItems);
            }
        } catch (error) {
            console.error("Failed to load or process invoice data for stock reconciliation:", error);
        } finally {
            setIsLoading(false);
        }
    }, []);

    const filteredAndSortedItems = useMemo(() => {
        let items = [...stockItems];

        if (searchTerm) {
            const lowercasedFilter = searchTerm.toLowerCase();
            items = items.filter(item =>
                item.productName.toLowerCase().includes(lowercasedFilter) ||
                item.productCode.toLowerCase().includes(lowercasedFilter)
            );
        }

        if (sortKey) {
            items.sort((a, b) => {
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
        }

        return items;
    }, [stockItems, searchTerm, sortKey, sortOrder]);

    const requestSort = (key: keyof StockItem) => {
        let direction: SortOrder = 'asc';
        if (sortKey === key && sortOrder === 'asc') {
            direction = 'desc';
        }
        setSortKey(key);
        setSortOrder(direction);
    };

    const getSortIndicator = (key: keyof StockItem) => {
        if (sortKey !== key) return <ArrowUpDown className="ml-2 h-4 w-4 opacity-30" />;
        return sortOrder === 'asc' ? 
               <ArrowUpDown className="ml-2 h-4 w-4 text-primary" /> : 
               <ArrowUpDown className="ml-2 h-4 w-4 text-primary" />;
    };


    return (
        <div className="container mx-auto px-4 py-8 md:px-8 md:py-12">
            <header className="mb-8 text-center">
                <h1 className="text-3xl md:text-4xl font-headline font-bold text-primary">Stock Reconciliation</h1>
                <p className="text-muted-foreground mt-2">
                    Aggregated view of all item quantities from processed invoices for stock checking.
                </p>
            </header>

            <main>
                <Card className="shadow-lg">
                    <CardHeader>
                        <CardTitle className="font-headline flex items-center gap-2">
                           <PackageCheck className="w-6 h-6 text-primary" />
                           Aggregated Item Quantities
                        </CardTitle>
                        <CardDescription>
                            This table sums up the quantities for each unique product code found in the invoices processed in the "Incoming Invoices" tab. Use the search box to filter results.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        {isLoading ? (
                            <p>Loading stock data...</p>
                        ) : stockItems.length > 0 ? (
                            <>
                                <div className="mb-4 relative">
                                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                    <Input
                                        placeholder="Search by Product Name or Code..."
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        className="pl-8 w-full max-w-sm"
                                    />
                                </div>
                                <div className="overflow-x-auto rounded-md border">
                                    <Table>
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
                                                     <Button variant="ghost" onClick={() => requestSort('totalQuantity')} className="px-1 py-1 h-auto">
                                                        Total Quantity {getSortIndicator('totalQuantity')}
                                                    </Button>
                                                </TableHead>
                                                <TableHead>Source Invoices (Up to 5)</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {filteredAndSortedItems.length > 0 ? (
                                                filteredAndSortedItems.map(item => (
                                                    <TableRow key={item.productCode} className="hover:bg-accent/10">
                                                        <TableCell className="font-medium">{item.productCode}</TableCell>
                                                        <TableCell>{item.productName}</TableCell>
                                                        <TableCell className="text-right font-bold">{item.totalQuantity}</TableCell>
                                                        <TableCell className="text-xs text-muted-foreground" title={[...new Set(item.sourceInvoices)].join(', ')}>
                                                            {[...new Set(item.sourceInvoices)].slice(0, 5).join(', ')}
                                                            {item.sourceInvoices.length > 5 ? '...' : ''}
                                                        </TableCell>
                                                    </TableRow>
                                                ))
                                            ) : (
                                                <TableRow>
                                                    <TableCell colSpan={4} className="text-center text-muted-foreground">
                                                        No items match your search.
                                                    </TableCell>
                                                </TableRow>
                                            )}
                                        </TableBody>
                                    </Table>
                                </div>
                            </>
                        ) : (
                            <Alert>
                                <Info className="h-4 w-4" />
                                <AlertTitle>No Data Available</AlertTitle>
                                <AlertDescription>
                                    No invoice data found. Please process some invoices in the "Incoming Invoices" page first. The data from that page is used to build this stock view.
                                </AlertDescription>
                            </Alert>
                        )}
                    </CardContent>
                </Card>
                 <footer className="text-center mt-4 py-4 border-t">
                    <p className="text-sm text-muted-foreground">&copy; {currentYear} PDF Suite. Stock Reconciliation Module.</p>
                </footer>
            </main>
        </div>
    );
}
