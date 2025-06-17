import type { ExtractedItem as LineItem } from '@/ai/schemas/invoice-item-schema';

export interface IncomingInvoiceData {
  rechnungsnummer?: string;
  datum?: string;
  lieferantName?: string;
  lieferantAdresse?: string;
  zahlungsziel?: string;
  gesamtbetrag?: number;
  mwstSatz?: string;
  rechnungspositionen: LineItem[];
}

export interface IncomingInvoiceItem extends IncomingInvoiceData {
  pdfFileName: string; 
}

export type IncomingProcessingStatus = 'idle' | 'processing' | 'success' | 'error';
