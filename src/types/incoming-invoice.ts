import type { ExtractedItem as LineItem } from '@/ai/schemas/invoice-item-schema';

export interface IncomingInvoiceData {
  rechnungsnummer?: string;
  datum?: string;
  lieferantName?: string;
  lieferantAdresse?: string;
  zahlungsziel?: string;
  zahlungsart?: string; 
  gesamtbetrag?: number;
  mwstSatz?: string;
  rechnungspositionen: LineItem[];
}

export interface IncomingInvoiceItem extends IncomingInvoiceData {
  pdfFileName: string; 
}

export interface ERPIncomingInvoiceItem extends IncomingInvoiceItem {
  erpNextInvoiceName?: string;
  istBezahlt?: 0 | 1;
  kontenrahmen?: string;
}

export type IncomingProcessingStatus = 'idle' | 'processing' | 'success' | 'error';
