
import type { BankTransaction, MatchedTransaction, MatchStatus } from './types';
import type { ERPIncomingInvoiceItem } from '@/types/incoming-invoice';
import { differenceInDays, parseISO } from 'date-fns';

// Configuration for matching
const AMOUNT_TOLERANCE = 0.01; // Allow for small discrepancies (e.g., rounding)
const DATE_TOLERANCE_DAYS = 3; // Match invoices within +/- 3 days of transaction date
const STRONG_SUSPECT_CONFIDENCE_THRESHOLD = 0.40; // Threshold above which a 'Suspect' is considered significant enough not to be overridden by "Rent Payment"

function calculateConfidence(
  invoiceNumberInDescMatched: boolean,
  amountMatched: boolean,
  dateMatched: boolean,
  supplierNameMatched: boolean
): number {
  let score = 0;
  
  if (invoiceNumberInDescMatched && amountMatched) { // Strongest match
    score = 0.95; 
  } else if (amountMatched && dateMatched && supplierNameMatched) {
    score = 0.85;
  } else if (amountMatched && dateMatched) {
    score = 0.75;
  } else if (amountMatched && supplierNameMatched) {
    score = 0.70;
  } else if (amountMatched) {
    score = 0.50;
  } else if (supplierNameMatched && dateMatched) {
    score = 0.40;
  } else if (supplierNameMatched) {
    score = 0.30;
  } else if (dateMatched) {
    score = 0.10;
  }
  return Math.min(score, 1.0);
}


export async function matchTransactions(
  transactions: BankTransaction[],
  invoices: ERPIncomingInvoiceItem[]
): Promise<MatchedTransaction[]> {
  const matchedResults: MatchedTransaction[] = [];
  const availableInvoices = [...invoices]; // Create a mutable copy

  for (const transaction of transactions) {
    const transactionDescriptionLower = (transaction.description + ' ' + (transaction.recipientOrPayer || '')).toLowerCase();

    // 1. Handle Refunds (positive amounts)
    if (transaction.amount > 0) {
      if (transactionDescriptionLower.includes('rückzahlung') || transactionDescriptionLower.includes('refund')) {
        matchedResults.push({
          transaction,
          matchedInvoice: null,
          status: 'Refund',
          confidence: undefined, // Not an invoice match confidence
        });
      } else {
        // Generic positive transaction, not identified as a specific refund type
        matchedResults.push({
          transaction,
          matchedInvoice: null,
          status: 'Unmatched', // Could be 'Income' or 'Credit' if we add more types
          confidence: 0,
        });
      }
      continue; // Done with this transaction, move to the next
    }

    // --- Only negative amounts (payments) reach here ---

    // 2. Attempt to match with Invoices
    let bestMatchInvoice: ERPIncomingInvoiceItem | null = null;
    let highestInvoiceMatchConfidence = 0;
    let bestInvoiceMatchStatus: MatchStatus = 'Unmatched';
    let bestMatchIndex = -1; // If you use a strategy to remove matched invoices

    const transactionDate = parseISO(transaction.date);
    const transactionAmountAbs = Math.abs(transaction.amount);

    for (let i = 0; i < availableInvoices.length; i++) {
      const invoice = availableInvoices[i];
      if (!invoice || !invoice.gesamtbetrag || !invoice.datum ) continue;

      const invoiceDate = parseISO(invoice.datum);
      const invoiceAmount = invoice.gesamtbetrag;
      
      const amountMatches = Math.abs(transactionAmountAbs - invoiceAmount) <= AMOUNT_TOLERANCE;
      const dateDiff = Math.abs(differenceInDays(transactionDate, invoiceDate));
      const dateMatches = dateDiff <= DATE_TOLERANCE_DAYS;

      const supplierNameLower = (invoice.lieferantName || '').toLowerCase();
      const supplierNameInTransaction = supplierNameLower ? transactionDescriptionLower.includes(supplierNameLower) : false;
      
      const invoiceNumberInTransaction = invoice.rechnungsnummer ? transactionDescriptionLower.includes(invoice.rechnungsnummer.toLowerCase()) : false;

      let currentConfidence = 0;
      let potentialStatus: MatchStatus = 'Unmatched';

      if (invoiceNumberInTransaction && amountMatches) {
        currentConfidence = calculateConfidence(true, true, dateMatches, supplierNameInTransaction);
        potentialStatus = 'Matched';
      } else if (amountMatches && dateMatches && supplierNameInTransaction) {
        currentConfidence = calculateConfidence(false, true, true, true);
        potentialStatus = 'Matched';
      } else if (amountMatches && (dateMatches || supplierNameInTransaction)) {
        currentConfidence = calculateConfidence(false, true, dateMatches, supplierNameInTransaction);
        potentialStatus = 'Suspect';
      } else if (amountMatches) {
         currentConfidence = calculateConfidence(false, true, false, false);
         potentialStatus = 'Suspect';
      } else if (supplierNameInTransaction && dateMatches) {
        currentConfidence = calculateConfidence(false, false, true, true);
        potentialStatus = 'Suspect'; 
      } else if (supplierNameInTransaction) {
         currentConfidence = calculateConfidence(false, false, false, true);
         potentialStatus = 'Suspect';
      }

      if (currentConfidence > highestInvoiceMatchConfidence) {
        highestInvoiceMatchConfidence = currentConfidence;
        bestMatchInvoice = invoice;
        bestInvoiceMatchStatus = potentialStatus;
        bestMatchIndex = i;
      }
    }
    
    if (bestMatchInvoice) { // Refine status based on final confidence from invoice matching
      if (highestInvoiceMatchConfidence >= 0.80) {
          bestInvoiceMatchStatus = 'Matched';
      } else if (highestInvoiceMatchConfidence >= STRONG_SUSPECT_CONFIDENCE_THRESHOLD) {
          bestInvoiceMatchStatus = 'Suspect';
      } else { // Confidence too low from invoice matching
          bestInvoiceMatchStatus = 'Unmatched';
          bestMatchInvoice = null; 
      }
    }

    // 3. Post-Invoice-Matching Checks for specific payment types (e.g., Rent)
    // Only if not already a 'Matched' or a strong 'Suspect' from invoice matching.
    const isSignificantInvoiceMatch = bestInvoiceMatchStatus === 'Matched' || (bestInvoiceMatchStatus === 'Suspect' && highestInvoiceMatchConfidence >= STRONG_SUSPECT_CONFIDENCE_THRESHOLD);

    if (!isSignificantInvoiceMatch) {
      if (transactionDescriptionLower.includes('miete') || transactionDescriptionLower.includes('rent')) {
        matchedResults.push({
          transaction,
          matchedInvoice: null, // No specific invoice associated with this 'Rent Payment' status
          status: 'Rent Payment',
          confidence: undefined, // Not an invoice match confidence
        });
        continue; // Done with this transaction
      }
    }

    // 4. Default push for invoice-related outcomes or truly unmatched payments
    // This is reached if:
    // - It's a payment that IS a 'Matched' or strong 'Suspect' to an invoice.
    // - OR it's a payment that is 'Unmatched' by invoices and NOT identified as 'Rent Payment'.
    matchedResults.push({
      transaction,
      matchedInvoice: bestMatchInvoice, // This will be null if status is Unmatched from invoice logic
      status: bestInvoiceMatchStatus,   // This will be Matched, Suspect, or Unmatched (if not rent)
      confidence: bestMatchInvoice ? highestInvoiceMatchConfidence : 0,
    });

    // Optional: Mark the invoice as "used" to prevent it from being matched again
    // if (bestInvoiceMatchStatus === 'Matched' && bestMatchInvoice && bestMatchIndex !== -1) {
    //   availableInvoices.splice(bestMatchIndex, 1); 
    // }
  }

  return matchedResults;
}

