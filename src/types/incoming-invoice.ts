
import type { AppLineItem as LineItem } from '@/ai/schemas/invoice-item-schema';

export type ParsedHeader = {
  supplier: string|null;
  supplier_invoice_no: string|null;
  invoice_date: string|null; // YYYY-MM-DD
  currency: string|null;
  net_total: number|null;
  tax_total: number|null;
  grand_total: number|null;
};

export type ParsedItem = {
  row: number;
  item_code: string|null;
  name: string;
  qty: number|null;
  uom: string|null;
  rate: number|null;
  amount: number|null;
  pos?: string|null;
  expense_account?: string|null;
};

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
  wahrung?: string; // Added currency field
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
