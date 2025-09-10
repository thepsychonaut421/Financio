
'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Info, PackageCheck, Search, ArrowUpDown, Loader2, RefreshCw, FileSpreadsheet, Send } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import Link from 'next/link';
import { AuthError } from '@/lib/auth-error';

interface StockItem {
    productCode: string;
    productName: string;
    totalQuantity: number;
    sourceInvoices: string[];
}

type SortKey = keyof StockItem | null;
type SortOrder = 'asc' | 'desc';

// --- Robust Fetch & Error Handling ---

class HttpError extends Error {
  status: number;
  body?: any;
  constructor(message: string, status = 0, body?: any) {
    super(message); this.status = status; this.body = body;
  }
}

function isPlausibleJwt(tok: unknown): tok is string {
  return typeof tok === 'string' && tok.split('.').length === 3 && tok.length > 100;
}

async function readSafePayload(res: Response) {
  try {
    const data = await res.json();
    return { data, error: data?.error, status: res.status, statusText: res.statusText };
  } catch {
    return { data: null, error: null, status: res.status, statusText: res.statusText };
  }
}

/**
 * Attaches token, retries once on 401, and does not mask non-auth errors.
 */
async function fetchWithAuth(
  getIdToken: (forceRefresh?: boolean) => Promise<string | null>,
  endpoint: string,
  options: RequestInit,
  { retryOn401 = true }: { retryOn401?: boolean } = {}
): Promise<Response> {
  // First attempt - use cached token to avoid extra RTT
  let idToken = await getIdToken();
  if (!isPlausibleJwt(idToken)) {
    idToken = await getIdToken(true); // Force refresh if cached one is bad
  }
  if (!isPlausibleJwt(idToken)) {
    throw new AuthError('Cannot fetch without a valid ID token.');
  }

  const doFetch = (tok: string) =>
    fetch(endpoint, {
      ...options,
      headers: { ...(options.headers || {}), Authorization: `Bearer ${tok}` },
      cache: 'no-store',
    });

  let res = await doFetch(idToken);

  // Retry once on 401 with a force-refreshed token
  if (retryOn401 && res.status === 401) {
    const fresh = await getIdToken(true);
    if (!isPlausibleJwt(fresh)) {
      throw new AuthError('Authentication failed: could not refresh ID token.');
    }
    res = await doFetch(fresh);
  }
  return res;
}


// --- CSV Generation ---

function escapeCsvField(field: string | number | undefined | null): string {
    if (field === undefined || field === null) return '';
    let stringField = String(field);

    if (/[",\n\r]/.test(stringField)) {
        stringField = `"${stringField.replace(/"/g, '""')}"`;
    }
    return stringField;
}

function toStockEntryCsv(items: StockItem[], company: string, warehouse: string): string {
    const BOM = '\uFEFF';
    const today = new Date().toISOString().slice(0, 10);

    const headers = [
        "stock_entry_type", "company", "posting_date",
        ...items.flatMap((_, idx) => [
            `items-${idx}.item_code`, `items-${idx}.t_warehouse`, `items-${idx}.qty`, `items-${idx}.uom`
        ])
    ].join(',');
    
    const firstRow = [
        "Material Receipt",
        company,
        today,
        ...items.flatMap(it => [
            it.productCode,
            warehouse,
            it.totalQuantity,
            "Stk"
        ])
    ];

    const csvContent = [
        headers,
        firstRow.map(escapeCsvField).join(',')
    ].join('\n');

    return BOM + csvContent;
}


function downloadFile(name: string, content: string, mime='text/csv;charset=utf-8;') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}


export function StockReconciliationPageContent() {
    const { user, isLoading: isAuthLoading, getIdToken } = useAuth();
    const { toast } = useToast();

    const [stockItems, setStockItems] = useState<StockItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [currentYear, setCurrentYear] = useState('');
    const [rawSearchTerm, setRawSearchTerm] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [sortKey, setSortKey] = useState<SortKey>('productName');
    const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
    const [defaultWarehouse, setDefaultWarehouse] = useState('');
    const [companyName, setCompanyName] = useState('');
    const [skippedItems, setSkippedItems] = useState(0);
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        setCurrentYear(new Date().getFullYear().toString());
    }, []);

    useEffect(() => {
        const timerId = setTimeout(() => {
            setSearchTerm(rawSearchTerm.trim());
        }, 180); 
        return () => clearTimeout(timerId);
    }, [rawSearchTerm]);

    const aggregateStockData = async () => {
        if (!user) {
            setIsLoading(false);
            return;
        };

        setIsLoading(true);
        try {
            const response = await fetchWithAuth(getIdToken, '/api/stock/aggregate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
            });
            
            const { data: payload, error: payloadErr, status } = await readSafePayload(response);

            if (!response.ok) {
                if (status === 401) throw new AuthError(payloadErr || 'Unauthorized');
                throw new HttpError(payloadErr || `Server returned HTTP ${status}`, status, payload);
            }

            setStockItems(payload.rows || []);
            setDefaultWarehouse(payload.warehouse || '');
            setCompanyName(payload.company || '');
            setSkippedItems(payload.skippedShippingItems || 0);

        } catch (error: any) {
             if (error instanceof AuthError) {
                toast({ title: 'Authentication Error', description: error.message, variant: 'destructive' });
                setStockItems([]);
            } else if (error instanceof HttpError) {
                toast({ title: 'Server Error', description: `${error.message}`, variant: 'destructive' });
            } else {
                toast({ title: 'Unexpected Error', description: error?.message || String(error), variant: 'destructive' });
            }
            console.error('[StockReconciliation] fetch/parse failed:', error?.message || error, error);
        } finally {
            setIsLoading(false);
        }
    };
    
     const handleSubmitToERPNext = async () => {
        if (stockItems.length === 0) {
            toast({ title: 'No Data', description: 'There are no items to submit.', variant: 'destructive' });
            return;
        }
        setIsSubmitting(true);
        try {
            const response = await fetchWithAuth(getIdToken, '/api/erpnext/stock', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ items: stockItems }),
            });

            const { data, error, status } = await readSafePayload(response);
            
            if (!response.ok) {
                if (status === 401) throw new AuthError(error || 'Unauthorized');
                throw new HttpError(error || 'Failed to submit to ERPNext.', status, data);
            }

            toast({
                title: 'Success!',
                description: `Stock Entry ${(data as any)?.name || 'document'} created successfully in ERPNext.`,
            });
        } catch (e: any) {
            if (e instanceof AuthError) {
                toast({ title: "Authentication Failed", description: e.message, variant: "destructive" });
            } else if (e instanceof HttpError) {
                toast({ title: `Submission Failed (HTTP ${e.status})`, description: e.message, variant: "destructive" });
            } else {
                toast({ title: 'Submission Failed', description: e.message, variant: 'destructive' });
            }
        } finally {
            setIsSubmitting(false);
        }
    };


    const handleExportCSV = () => {
        if (filteredAndSortedItems.length === 0) {
             toast({ title: "No Data", description: "There is no data to export.", variant: "destructive"});
             return;
        }
        if (!companyName || !defaultWarehouse) {
            toast({ title: "Missing Settings", description: "Company Name and Default Warehouse must be set to export.", variant: "destructive"});
            return;
        }
        const csv = toStockEntryCsv(filteredAndSortedItems, companyName, defaultWarehouse);
        downloadFile('stock_entry_material_receipt.csv', csv);
    };

    useEffect(() => {
       if (!isAuthLoading && user) {
           aggregateStockData();
       } else if (!isAuthLoading && !user) {
            setIsLoading(false);
            setStockItems([]);
       }
    }, [user, isAuthLoading]);

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
        setSortOrder(prev => (sortKey === key && prev === 'asc' ? 'desc' : 'asc'));
        setSortKey(key);
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
                    Aggregated view of all item quantities from processed invoices for stock checking. Shipping fees are automatically excluded.
                </p>
            </header>
            <main>
                <Card className="shadow-lg">
                    <CardHeader>
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
                            <div>
                                <CardTitle className="font-headline flex items-center gap-2">
                                <PackageCheck className="w-6 h-6 text-primary" />
                                Aggregated Item Quantities
                                </CardTitle>
                                <CardDescription>
                                    This table sums up quantities for each unique product from processed invoices.
                                </CardDescription>
                            </div>
                            <Button onClick={aggregateStockData} disabled={isLoading || !user} variant="outline" className="mt-4 sm:mt-0">
                                {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                                Refresh Data
                            </Button>
                        </div>
                    </CardHeader>
                    <CardContent>
                        {isAuthLoading ? (
                            <div className="flex items-center justify-center p-8"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
                        ) : !user ? (
                             <Alert><Info className="h-4 w-4" /><AlertTitle>Not Logged In</AlertTitle><AlertDescription>Please <Link href="/login" className="underline text-primary">log in</Link> to view and reconcile stock.</AlertDescription></Alert>
                        ) : isLoading ? (
                           <div className="flex items-center justify-center p-8"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
                        ) : stockItems.length > 0 ? (
                            <>
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                                    <div className="relative w-full sm:max-w-sm">
                                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                        <Input
                                            placeholder="Search by Product Name or Code..."
                                            value={rawSearchTerm}
                                            onChange={(e) => setRawSearchTerm(e.target.value)}
                                            className="pl-8"
                                        />
                                    </div>
                                    <div className="flex gap-2 w-full sm:w-auto">
                                        <Button variant="outline" onClick={handleExportCSV} disabled={filteredAndSortedItems.length === 0}>
                                            <FileSpreadsheet className="mr-2 h-4 w-4"/> Export CSV
                                        </Button>
                                         <Button onClick={handleSubmitToERPNext} disabled={isSubmitting || filteredAndSortedItems.length === 0}>
                                            {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Send className="mr-2 h-4 w-4"/>}
                                            Submit to ERPNext
                                        </Button>
                                    </div>
                                </div>
                                 <div className="text-sm text-muted-foreground text-right w-full sm:w-auto mb-4">
                                    <p>Default Warehouse: <strong>{defaultWarehouse || "Not Set"}</strong></p>
                                    <p>Company: <strong>{companyName || "Not Set"}</strong></p>
                                    <p>Skipped Shipping Items: <strong>{skippedItems}</strong></p>
                                </div>
                                <div className="overflow-x-auto rounded-md border">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead><Button variant="ghost" onClick={() => requestSort('productCode')} className="px-1 py-1 h-auto">Product Code {getSortIndicator('productCode')}</Button></TableHead>
                                                <TableHead><Button variant="ghost" onClick={() => requestSort('productName')} className="px-1 py-1 h-auto">Product Name {getSortIndicator('productName')}</Button></TableHead>
                                                <TableHead className="text-right"><Button variant="ghost" onClick={() => requestSort('totalQuantity')} className="px-1 py-1 h-auto">Total Quantity {getSortIndicator('totalQuantity')}</Button></TableHead>
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
                                                        <TableCell className="text-xs text-muted-foreground" title={item.sourceInvoices.join(', ')}>
                                                            {item.sourceInvoices.join(', ')}{item.sourceInvoices.length >= 5 ? '...' : ''}
                                                        </TableCell>
                                                    </TableRow>
                                                ))
                                            ) : (
                                                <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">No items match your search.</TableCell></TableRow>
                                            )}
                                        </TableBody>
                                    </Table>
                                </div>
                            </>
                        ) : (
                            <Alert>
                                <Info className="h-4 w-4" /><AlertTitle>No Data Available</AlertTitle>
                                <AlertDescription>No stock data could be aggregated. This could be because no invoices have been processed yet, or there are no items with product codes in them.<br />Go to the <Link href="/incoming-invoices" className="underline text-primary">Incoming Invoices</Link> page to get started. Or check your <Link href="/settings/stock" className="underline text-primary">Stock Settings</Link>.</AlertDescription>
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

    