import type { BankTransaction, MatchedTransaction, MatchStatus } from './types';
import type { ERPIncomingInvoiceItem } from '@/types/incoming-invoice';
import { differenceInDays, parseISO } from 'date-fns';

// Configuration for matching
const AMOUNT_TOLERANCE = 0.01; // Allow for small discrepancies, e.g., rounding
const DATE_TOLERANCE_DAYS = 7; // Match invoices within +/- 7 days of transaction date

function calculateConfidence(
  transaction: BankTransaction,
  invoice: ERPIncomingInvoiceItem,
  dateMatched: boolean,
  amountMatched: boolean,
  supplierNameMatched: boolean,
  invoiceNumberInDescMatched: boolean
): number {
  let score = 0;
  
  if (amountMatched) score += 0.4; // Amount is a strong indicator
  if (dateMatched) score += 0.2;   // Date proximity is important
  if (supplierNameMatched) score += 0.3; // Supplier name match is also strong
  if (invoiceNumberInDescMatched) score += 0.5; // Invoice number in description is very strong (can exceed 1.0, capped later)

  return Math.min(score, 1.0); // Cap confidence at 1.0
}


export async function matchTransactions(
  transactions: BankTransaction[],
  invoices: ERPIncomingInvoiceItem[]
): Promise<MatchedTransaction[]> {
  const matchedResults: MatchedTransaction[] = [];

  for (const transaction of transactions) {
    let bestMatch: ERPIncomingInvoiceItem | null = null;
    let highestConfidence = 0;
    let bestMatchStatus: MatchStatus = 'Unmatched';

    // Only attempt to match payments (negative amounts) for now
    if (transaction.amount >= 0) {
      matchedResults.push({
        transaction,
        matchedInvoice: null,
        status: 'Unmatched', // Or a new status like 'Income' or 'Non-Payment'
        confidence: 0,
      });
      continue;
    }

    const transactionDate = parseISO(transaction.date);
    const transactionAmountAbs = Math.abs(transaction.amount);

    for (const invoice of invoices) {
      if (!invoice.gesamtbetrag || !invoice.datum) continue;

      const invoiceDate = parseISO(invoice.datum); // Assuming invoice.datum is YYYY-MM-DD
      const invoiceAmount = invoice.gesamtbetrag;
      
      const amountMatches = Math.abs(transactionAmountAbs - invoiceAmount) <= AMOUNT_TOLERANCE;
      const dateDiff = Math.abs(differenceInDays(transactionDate, invoiceDate));
      const dateMatches = dateDiff <= DATE_TOLERANCE_DAYS;

      const supplierNameInDesc = invoice.lieferantName && transaction.description.toLowerCase().includes(invoice.lieferantName.toLowerCase());
      const supplierNameInRecipient = invoice.lieferantName && transaction.recipientOrPayer && transaction.recipientOrPayer.toLowerCase().includes(invoice.lieferantName.toLowerCase());
      const supplierMatches = !!(supplierNameInDesc || supplierNameInRecipient);

      const invoiceNumberInDesc = invoice.rechnungsnummer && transaction.description.includes(invoice.rechnungsnummer);

      if (amountMatches || dateMatches || supplierMatches || invoiceNumberInDesc) {
        const confidence = calculateConfidence(transaction, invoice, dateMatches, amountMatches, supplierMatches, invoiceNumberInDesc);
        
        if (confidence > highestConfidence) {
          highestConfidence = confidence;
          bestMatch = invoice;

          if (confidence >= 0.85 && amountMatches && (supplierMatches || invoiceNumberInDesc)) {
            bestMatchStatus = 'Matched';
          } else if (confidence >= 0.5) {
            bestMatchStatus = 'Suspect';
          } else {
            bestMatchStatus = 'Unmatched'; 
          }
        }
      }
    }
    
    // If a suspect match was found but criteria for "Matched" not fully met, ensure it's at least Suspect.
    if (bestMatch && bestMatchStatus === 'Unmatched' && highestConfidence >= 0.4) {
        bestMatchStatus = 'Suspect';
    }


    matchedResults.push({
      transaction,
      matchedInvoice: bestMatchStatus !== 'Unmatched' ? bestMatch : null,
      status: bestMatch ? bestMatchStatus : 'Unmatched',
      confidence: bestMatch ? highestConfidence : 0,
    });
  }

  return matchedResults;
}
