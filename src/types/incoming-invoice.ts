
import type { AppLineItem as LineItem } from '@/ai/schemas/invoice-item-schema';

export interface IncomingInvoiceData {
  rechnungsnummer?: string;
  datum?: string; // Should be YYYY-MM-DD after processing for ERP mode
  lieferantName?: string;
  lieferantAdresse?: string;
  zahlungsziel?: string;
  zahlungsart?: string;
  gesamtbetrag?: number;
  mwstSatz?: string;
  rechnungspositionen: LineItem[];
  kundenNummer?: string;
  bestellNummer?: string;
  isPaidByAI?: boolean;
}

export interface IncomingInvoiceItem extends IncomingInvoiceData {
  pdfFileName: string;
}

export interface ERPIncomingInvoiceItem extends IncomingInvoiceItem {
  erpNextInvoiceName?: string; // For UI reference only
  istBezahlt?: 0 | 1; // This is the final 0/1 for ERPNext
  kontenrahmen?: string;
  wahrung?: string; // e.g., EUR
  billDate?: string; // YYYY-MM-DD
  dueDate?: string; // YYYY-MM-DD
  remarks?: string;
}

export type IncomingProcessingStatus = 'idle' | 'processing' | 'success' | 'error';
