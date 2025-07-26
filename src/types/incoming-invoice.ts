
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
  error?: string;
  // New detailed financial fields
  nettoBetrag?: number;
  mwstBetrag?: number;
}

export interface IncomingInvoiceItem extends IncomingInvoiceData {
  pdfFileName: string;
}

export interface ERPIncomingInvoiceItem extends IncomingInvoiceItem {
  erpNextInvoiceName?: string; 
  istBezahlt?: 0 | 1; 
  kontenrahmen?: string;
  wahrung?: string; 
  billDate?: string; 
  dueDate?: string; 
  remarks?: string;
}

export type IncomingProcessingStatus = 'idle' | 'processing' | 'success' | 'error';

// Define sortable keys for ERPIncomingInvoiceItem
export type ERPSortKey = 
  | 'rechnungsnummer' 
  | 'datum' 
  | 'lieferantName' 
  | 'gesamtbetrag' 
  | 'pdfFileName'
  | 'erpNextInvoiceName';

export type SortOrder = 'asc' | 'desc';

    