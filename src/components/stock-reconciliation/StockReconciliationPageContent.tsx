
'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Info, PackageCheck } from 'lucide-react';
import type { ERPIncomingInvoiceItem } from '@/types/incoming-invoice';
import type { AppLineItem } from '@/ai/schemas/invoice-item-schema';

const LOCAL_STORAGE_MATCHER_DATA_KEY = 'processedIncomingInvoicesForMatcher';

interface StockItem {
    productCode: string;
    productName: string;
    totalQuantity: number;
    sourceInvoices: string[];
}

export function StockReconciliationPageContent() {
    const [stockItems, setStockItems] = useState<StockItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [currentYear, setCurrentYear] = useState('');

    useEffect(() => {
        setCurrentYear(new Date().getFullYear().toString());
        try {
            const storedInvoicesString = localStorage.getItem(LOCAL_STORAGE_MATCHER_DATA_KEY);
            if (storedInvoicesString) {
                const invoices: ERPIncomingInvoiceItem[] = JSON.parse(storedInvoicesString);
                const itemMap = new Map<string, StockItem>();

                invoices.forEach(invoice => {
                    invoice.rechnungspositionen.forEach(lineItem => {
                        if (!lineItem.productCode) return; // Skip items without a product code

                        const existing = itemMap.get(lineItem.productCode);
                        if (existing) {
                            existing.totalQuantity += lineItem.quantity;
                            existing.sourceInvoices.push(invoice.rechnungsnummer || invoice.pdfFileName);
                        } else {
                            itemMap.set(lineItem.productCode, {
                                productCode: lineItem.productCode,
                                productName: lineItem.productName,
                                totalQuantity: lineItem.quantity,
                                sourceInvoices: [invoice.rechnungsnummer || invoice.pdfFileName],
                            });
                        }
                    });
                });
                
                const sortedItems = Array.from(itemMap.values()).sort((a, b) => 
                    a.productName.localeCompare(b.productName)
                );
                setStockItems(sortedItems);
            }
        } catch (error) {
            console.error("Failed to load or process invoice data for stock reconciliation:", error);
        } finally {
            setIsLoading(false);
        }
    }, []);

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
                            This table sums up the quantities for each unique product code found in the invoices processed in the "Incoming Invoices" tab.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        {isLoading ? (
                            <p>Loading stock data...</p>
                        ) : stockItems.length > 0 ? (
                            <div className="overflow-x-auto rounded-md border">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Product Code</TableHead>
                                            <TableHead>Product Name</TableHead>
                                            <TableHead className="text-right">Total Quantity</TableHead>
                                            <TableHead>Source Invoices (Up to 5)</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {stockItems.map(item => (
                                            <TableRow key={item.productCode}>
                                                <TableCell className="font-medium">{item.productCode}</TableCell>
                                                <TableCell>{item.productName}</TableCell>
                                                <TableCell className="text-right font-bold">{item.totalQuantity}</TableCell>
                                                <TableCell className="text-xs text-muted-foreground">
                                                    {[...new Set(item.sourceInvoices)].slice(0, 5).join(', ')}
                                                    {item.sourceInvoices.length > 5 ? '...' : ''}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
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

