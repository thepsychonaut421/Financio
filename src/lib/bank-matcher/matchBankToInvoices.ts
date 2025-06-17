
import type { BankTransaction, MatchedTransaction, MatchStatus } from './types';
import type { ERPIncomingInvoiceItem } from '@/types/incoming-invoice';
import { differenceInDays, parseISO } from 'date-fns';

// Configuration for matching
const AMOUNT_TOLERANCE = 0.01; // Allow for small discrepancies (e.g., rounding)
const DATE_TOLERANCE_DAYS = 3; // Match invoices within +/- 3 days of transaction date

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
  // If only invoice number is found but not amount, it's likely not a good match on its own.
  // Consider if invoiceNumberInDescMatched alone should give some score if it's very unique.
  // For now, invoice number is powerful when combined with amount.

  return Math.min(score, 1.0); // Cap confidence at 1.0
}


export async function matchTransactions(
  transactions: BankTransaction[],
  invoices: ERPIncomingInvoiceItem[]
): Promise<MatchedTransaction[]> {
  const matchedResults: MatchedTransaction[] = [];
  const availableInvoices = [...invoices]; // Create a mutable copy to mark invoices as used

  for (const transaction of transactions) {
    let bestMatch: ERPIncomingInvoiceItem | null = null;
    let highestConfidence = 0;
    let bestMatchStatus: MatchStatus = 'Unmatched';
    let bestMatchIndex = -1;

    // Only attempt to match payments (negative amounts)
    if (transaction.amount >= 0) {
      matchedResults.push({
        transaction,
        matchedInvoice: null,
        status: 'Unmatched', // Or a new status like 'Income'
        confidence: 0,
      });
      continue;
    }

    const transactionDate = parseISO(transaction.date);
    const transactionAmountAbs = Math.abs(transaction.amount);
    const transactionDescriptionLower = (transaction.description + ' ' + (transaction.recipientOrPayer || '')).toLowerCase();


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

      // Rule 1: Invoice Number + Amount
      if (invoiceNumberInTransaction && amountMatches) {
        currentConfidence = calculateConfidence(true, true, dateMatches, supplierNameInTransaction);
        potentialStatus = 'Matched';
      } 
      // Rule 2: Amount + Date + Supplier
      else if (amountMatches && dateMatches && supplierNameInTransaction) {
        currentConfidence = calculateConfidence(false, true, true, true);
        potentialStatus = 'Matched';
      }
      // Rule 3: Amount + Date OR Amount + Supplier
      else if (amountMatches && (dateMatches || supplierNameInTransaction)) {
        currentConfidence = calculateConfidence(false, true, dateMatches, supplierNameInTransaction);
        potentialStatus = 'Suspect';
      }
      // Rule 4: Amount only (lower confidence)
      else if (amountMatches) {
         currentConfidence = calculateConfidence(false, true, false, false);
         potentialStatus = 'Suspect';
      }
      // Rule 5: Supplier + Date (without amount match, very low confidence)
      else if (supplierNameInTransaction && dateMatches) {
        currentConfidence = calculateConfidence(false, false, true, true);
        potentialStatus = 'Suspect'; 
      }
       // Rule 6: Only supplier name (lowest confidence for suspect)
      else if (supplierNameInTransaction) {
         currentConfidence = calculateConfidence(false, false, false, true);
         potentialStatus = 'Suspect';
      }


      if (currentConfidence > highestConfidence) {
        highestConfidence = currentConfidence;
        bestMatch = invoice;
        bestMatchStatus = potentialStatus;
        bestMatchIndex = i;
      }
    }
    
    if (bestMatch) {
      // Refine status based on final confidence
      if (highestConfidence >= 0.80) { // Higher threshold for "Matched"
          bestMatchStatus = 'Matched';
      } else if (highestConfidence >= 0.40) { // Threshold for "Suspect"
          bestMatchStatus = 'Suspect';
      } else {
          bestMatchStatus = 'Unmatched'; // If confidence is too low, revert to Unmatched
          bestMatch = null; // Clear bestMatch if it's Unmatched
      }
    }


    matchedResults.push({
      transaction,
      matchedInvoice: bestMatch,
      status: bestMatchStatus,
      confidence: bestMatch ? highestConfidence : 0,
    });

    // Optional: Mark the invoice as "used" to prevent it from being matched again if desired.
    // For simple 1-to-1 matching, this is useful.
    // If one payment can match multiple or partial, this logic needs to be more complex.
    // if (bestMatch && bestMatchIndex !== -1 && bestMatchStatus === 'Matched') {
    //   availableInvoices.splice(bestMatchIndex, 1); 
    // }
  }

  return matchedResults;
}

