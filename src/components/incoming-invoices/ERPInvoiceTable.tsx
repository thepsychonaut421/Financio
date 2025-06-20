
'use client';

import type { ERPIncomingInvoiceItem } from '@/types/incoming-invoice';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableCaption } from '@/components/ui/table';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { FileSpreadsheet, AlertTriangle, Landmark, CheckSquare } from 'lucide-react';

interface ERPInvoiceTableProps {
  invoices: ERPIncomingInvoiceItem[];
  existingErpInvoiceKeys?: Set<string>; // New prop
}

const DetailItem: React.FC<{ label: string; value?: string | number | null; isBadge?: boolean }> = ({ label, value, isBadge }) => {
  if (value === undefined || value === null || value === '') return null;
  return (
    <div className="py-1">
      <span className="text-sm font-medium text-muted-foreground">{label}: </span>
      {isBadge ? <Badge variant="secondary">{String(value)}</Badge> : <span className="text-sm text-foreground">{String(value)}</span>}
    </div>
  );
};

const createInvoiceKeyForTable = (invoice: ERPIncomingInvoiceItem): string => {
    const supplier = (invoice.lieferantName || '').trim().toLowerCase();
    const number = (invoice.rechnungsnummer || '').trim().toLowerCase();
    return `${supplier}||${number}`;
};

export function ERPInvoiceTable({ invoices, existingErpInvoiceKeys }: ERPInvoiceTableProps) {
  
  const formatCurrency = (value: number | undefined, currency?: string) => {
    if (value === undefined) return 'N/A';
    return new Intl.NumberFormat('de-DE', { style: 'currency', currency: currency || 'EUR' }).format(value);
  }

  const formatDateForERP = (dateString?: string) => {
    if (!dateString) return 'N/A';
    const dateParts = dateString.match(/(\d{2})\.(\d{2})\.(\d{4})/); // DD.MM.YYYY
    if (dateParts && dateParts[3] && dateParts[2] && dateParts[1]) {
        return `${dateParts[3]}-${dateParts[2]}-${dateParts[1]}`; // YYYY-MM-DD
    }
    if (dateString.match(/^\d{4}-\d{2}-\d{2}$/)) { // Already YYYY-MM-DD
        return dateString;
    }
    return dateString; // Return original if no match
  }

  if (!invoices || invoices.length === 0) {
    return (
      <Card className="mt-8 shadow-lg">
        <CardHeader>
          <CardTitle className="font-headline flex items-center gap-2">
            <FileSpreadsheet className="w-6 h-6 text-primary" />
            ERP Vorlage Data
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-center py-8">No ERP data processed. Upload PDFs and enable ERP Vorlage Mode.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-lg w-full mt-8">
      <CardHeader>
        <CardTitle className="font-headline text-xl text-primary flex items-center gap-2">
          <FileSpreadsheet className="w-5 h-5" />
          ERP Vorlage - Processed Invoices
        </CardTitle>
        <CardDescription>
          Data structured for ERPNext import. Each section represents one processed PDF.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Accordion type="multiple" className="w-full space-y-4">
          {invoices.map((invoice, index) => {
            const invoiceKey = createInvoiceKeyForTable(invoice);
            const isPotentiallyInERP = existingErpInvoiceKeys?.has(invoiceKey) ?? false;

            return (
                <AccordionItem value={`invoice-${index}`} key={invoice.pdfFileName + '-' + index} className="border bg-card rounded-lg shadow-md">
                <AccordionTrigger className="px-4 py-3 hover:no-underline">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between w-full">
                    <div className='text-left'>
                        <span className="font-semibold text-primary text-base block">
                        {invoice.rechnungsnummer || 'N/A'}
                        </span>
                        <span className="text-xs text-muted-foreground block">
                        (Source: {invoice.pdfFileName} - ERP Ref: {invoice.erpNextInvoiceName || 'N/A'})
                        </span>
                    </div>
                    <div className="flex flex-col sm:flex-row items-end sm:items-center gap-2 mt-2 sm:mt-0">
                        {isPotentiallyInERP && (
                            <Badge variant="outline" className="bg-green-100 text-green-700 border-green-500 text-xs">
                                <CheckSquare className="w-3 h-3 mr-1" />
                                Possibly in ERP
                            </Badge>
                        )}
                        <Badge variant={invoice.istBezahlt === 1 ? 'default' : 'outline'} className="text-xs">
                        {invoice.istBezahlt === 1 ? 'Bezahlt' : 'Offen'}
                        </Badge>
                    </div>
                    </div>
                </AccordionTrigger>
                <AccordionContent className="px-4 pb-4 space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-2 p-3 border rounded-md bg-background/70">
                    <DetailItem label="ERP Ref. (UI)" value={invoice.erpNextInvoiceName} isBadge />
                    <DetailItem label="Supplier Invoice No" value={invoice.rechnungsnummer} />
                    <DetailItem label="Posting Date (ERP)" value={formatDateForERP(invoice.datum)} />
                    <DetailItem label="Supplier" value={invoice.lieferantName} />
                    <DetailItem label="Supplier Address" value={invoice.lieferantAdresse} />
                    <DetailItem label="Payment Terms" value={invoice.zahlungsziel} />
                    <DetailItem label="Payment Method" value={invoice.zahlungsart} />
                    <DetailItem label="Grand Total" value={formatCurrency(invoice.gesamtbetrag, invoice.wahrung)} />
                    <DetailItem label="VAT Rate" value={invoice.mwstSatz} />
                    <DetailItem label="Is Paid" value={invoice.istBezahlt === 1 ? 'Yes (1)' : 'No (0)'} />
                    <DetailItem label="Accounts Payable" value={invoice.kontenrahmen} isBadge />
                    <DetailItem label="Currency" value={invoice.wahrung} />
                    <DetailItem label="Original PDF" value={invoice.pdfFileName} />
                    </div>

                    {invoice.rechnungspositionen && invoice.rechnungspositionen.length > 0 ? (
                    <div className="mt-3">
                        <h4 className="text-md font-semibold mb-1 text-primary-dark">Line Items:</h4>
                        <div className="overflow-x-auto rounded-md border">
                        <Table>
                            <TableHeader>
                            <TableRow>
                                <TableHead>Item Code</TableHead>
                                <TableHead>Item Name</TableHead>
                                <TableHead className="text-right">Qty</TableHead>
                                <TableHead className="text-right">Rate</TableHead>
                            </TableRow>
                            </TableHeader>
                            <TableBody>
                            {invoice.rechnungspositionen.map((item, itemIndex) => (
                                <TableRow key={`${item.productCode}-${itemIndex}`} className="hover:bg-accent/10">
                                <TableCell className="font-medium">{item.productCode || 'N/A'}</TableCell>
                                <TableCell>{item.productName || 'N/A'}</TableCell>
                                <TableCell className="text-right">{item.quantity ?? 'N/A'}</TableCell>
                                <TableCell className="text-right">{formatCurrency(item.unitPrice, invoice.wahrung)}</TableCell>
                                </TableRow>
                            ))}
                            </TableBody>
                        </Table>
                        </div>
                    </div>
                    ) : (
                    <p className="text-sm text-muted-foreground mt-3 flex items-center gap-1">
                        <AlertTriangle className="w-4 h-4 text-orange-500" /> No line items extracted for this invoice.
                    </p>
                    )}
                </AccordionContent>
                </AccordionItem>
            );
        })}
        </Accordion>
      </CardContent>
    </Card>
  );
}
