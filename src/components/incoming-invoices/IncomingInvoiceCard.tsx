
'use client';

import type { IncomingInvoiceItem } from '@/types/incoming-invoice';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableCaption } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { FileText, CalendarDays, Briefcase, MapPin, Clock, Euro, Percent, CheckSquare } from 'lucide-react';

interface IncomingInvoiceCardProps {
  invoice: IncomingInvoiceItem;
  isPotentiallyInERP?: boolean; // New prop
}

const DetailItem: React.FC<{ icon: React.ReactNode; label: string; value?: string | number | null }> = ({ icon, label, value }) => {
  if (value === undefined || value === null || value === '') return null;
  return (
    <div className="flex items-start space-x-3">
      <span className="text-primary flex-shrink-0 w-5 h-5 mt-1">{icon}</span>
      <div>
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <p className="text-base text-foreground break-words">{String(value)}</p>
      </div>
    </div>
  );
};


export function IncomingInvoiceCard({ invoice, isPotentiallyInERP }: IncomingInvoiceCardProps) {
  const formatCurrency = (value: number | undefined) => {
    if (value === undefined) return 'N/A';
    return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(value);
  }

  return (
    <Card className="shadow-lg w-full">
      <CardHeader>
        <div className="flex justify-between items-start">
            <div>
                <CardTitle className="font-headline text-xl text-primary flex items-center gap-2">
                    <FileText className="w-5 h-5" />
                    Invoice Details: {invoice.pdfFileName}
                </CardTitle>
                {invoice.rechnungsnummer && <CardDescription>Rechnungsnummer: <Badge variant="secondary">{invoice.rechnungsnummer}</Badge></CardDescription>}
            </div>
            {isPotentiallyInERP && (
                <Badge variant="outline" className="ml-auto mt-1 bg-green-100 text-green-700 border-green-500">
                    <CheckSquare className="w-3.5 h-3.5 mr-1.5" />
                    Possibly in ERP
                </Badge>
            )}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-4">
          <DetailItem icon={<CalendarDays />} label="Rechnungsdatum (Date)" value={invoice.datum} />
          <DetailItem icon={<Briefcase />} label="Lieferant (Supplier)" value={invoice.lieferantName} />
          <DetailItem icon={<MapPin />} label="Lieferant Adresse (Supplier Address)" value={invoice.lieferantAdresse} />
          <DetailItem icon={<Clock />} label="Zahlungsziel (Payment Term)" value={invoice.zahlungsziel} />
          <DetailItem icon={<Euro />} label="Gesamtbetrag (Total Amount)" value={formatCurrency(invoice.gesamtbetrag)} />
          <DetailItem icon={<Percent />} label="MwSt.-Satz (VAT Rate)" value={invoice.mwstSatz} />
        </div>

        {invoice.rechnungspositionen && invoice.rechnungspositionen.length > 0 && (
          <div>
            <h4 className="text-lg font-semibold mb-2 text-primary-dark font-headline">Rechnungspositionen (Line Items)</h4>
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableCaption className="py-2">Details of billed items or services.</TableCaption>
                <TableHeader>
                  <TableRow>
                    <TableHead>Produkt Code</TableHead>
                    <TableHead>Produkt Name</TableHead>
                    <TableHead className="text-right">Menge</TableHead>
                    <TableHead className="text-right">Einzelpreis</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoice.rechnungspositionen.map((item, index) => (
                    <TableRow key={`${item.productCode}-${index}`} className="hover:bg-accent/20">
                      <TableCell className="font-medium">{item.productCode || 'N/A'}</TableCell>
                      <TableCell>{item.productName || 'N/A'}</TableCell>
                      <TableCell className="text-right">{item.quantity ?? 'N/A'}</TableCell>
                      <TableCell className="text-right">{formatCurrency(item.unitPrice)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
         {(!invoice.rechnungspositionen || invoice.rechnungspositionen.length === 0) && (
            <p className="text-sm text-muted-foreground">No line items extracted for this invoice.</p>
        )}
      </CardContent>
       {(Object.values(invoice).filter(val => val !== undefined && val !== null && (typeof val !== 'object' || (Array.isArray(val) && val.length > 0))).length === 1 && invoice.pdfFileName) && (
         <CardFooter>
            <p className="text-sm text-destructive-foreground bg-destructive/80 p-2 rounded-md">
              Could not extract detailed data from this PDF. It might be an image-based PDF or have an unusual format.
            </p>
         </CardFooter>
       )}
    </Card>
  );
}
