
import type { ERPIncomingInvoiceItem } from '@/types/incoming-invoice';

export interface BankTransaction {
  id: string; // Unique ID for the transaction (e.g., combination of date, amount, description hash)
  date: string; // ISO Date string (YYYY-MM-DD)
  description: string;
  amount: number; // Negative for payments, positive for income
  currency?: string; // e.g., EUR
  recipientOrPayer?: string;
  // Add other relevant fields from typical bank statements
  // e.g., transactionType, referenceNumber, balanceAfterTransaction
}

export type MatchStatus = 'Matched' | 'Suspect' | 'Unmatched' | 'Refund' | 'Rent Payment';

export interface MatchedTransaction {
  transaction: BankTransaction;
  matchedInvoice: ERPIncomingInvoiceItem | null;
  status: MatchStatus;
  confidence?: number; // 0 to 1, indicating match confidence
}

// Expected structure of a row from a parsed bank statement CSV
// This is a generic example; you'll need to adapt it based on specific bank CSV formats
export interface BankStatementCSVRow {
  'Datum'?: string; // e.g., 17.01.2025 or 2025-01-17
  'Buchungstext'?: string; // Description
  'Betrag'?: string; // e.g., -129.95 or 129,95
  'Währung'?: string; // e.g., EUR
  'Empfänger/Zahlungspflichtiger'?: string; // Recipient or Payer
  // Add other potential column names from bank CSVs
  [key: string]: string | undefined; // Allow for other columns
}

