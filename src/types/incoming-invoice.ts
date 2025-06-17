import type { ExtractedItem as LineItem } from '@/ai/flows/normalize-and-deduplicate-data';

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
