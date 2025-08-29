'use server';

import type { BankTransaction, PaymentEntry } from '../types';
import type { ERPIncomingInvoiceItem } from '@/types/incoming-invoice';
import { parseBankCSV, toBankTransactions } from '@/csv/parsers';
import { matchTransactions } from '@/lib/bank-matcher/matchBankToInvoices';
import { findExistingBankTransaction } from './dedupe';
import { logInfo } from '@/lib/logger';
import { createBankTransaction as createBankTransactionInERPNext } from '../api';

/** Parse CSV text into ERPNext Bank Transaction payloads. */
export function parseCsvLines(csv: string, account: string): BankTransaction[] {
  const rows = parseBankCSV(csv);
  return toBankTransactions(rows, account);
}

interface Options {
  endpoint: string;
  headers?: Record<string, string>;
}

/**
 * Upsert a set of bank transactions into ERPNext using idempotency keys to
 * avoid duplicates. Returns the keys of newly created transactions.
 */
export async function upsertBankTransactions(
  transactions: BankTransaction[],
  options: Options
): Promise<string[]> {
  const created: string[] = [];
  for (const tx of transactions) {
    const existing = await findExistingBankTransaction(tx, options);
    if (existing) {
      logInfo(
        {
          workflow: 'bank-upsert',
          docType: 'Bank Transaction',
          docId: tx.reference_number,
          idemKey: existing.name,
          action: 'noop',
        },
        'Bank transaction already exists'
      );
      continue;
    }
    
    // Use the new API client to create the transaction
    const response = await createBankTransactionInERPNext(tx);

    logInfo(
      {
        workflow: 'bank-upsert',
        docType: 'Bank Transaction',
        docId: tx.reference_number,
        action: 'insert',
        response,
      },
      'Upserted bank transaction'
    );
    if(response.data?.name) {
      created.push(response.data.name);
    }
  }
  return created;
}


/**
 * Apply matching rules between bank transactions and provided invoices. When
 * `createPayments` is true, Payment Entries will be created in ERPNext for
 * transactions confidently matched to an invoice.
 */
export async function applyMatchingRules(
  transactions: BankTransaction[],
  invoices: ERPIncomingInvoiceItem[],
  options: Options & { paymentEndpoint?: string; createPayments?: boolean }
) {
  const matches = await matchTransactions(transactions, invoices);
  if (options.createPayments && options.paymentEndpoint) {
    for (const m of matches) {
      if (m.matchedInvoice && m.status === 'Matched') {
        const amount = Math.abs(
          m.transaction.deposit ?? -(m.transaction.withdrawal || 0)
        );
        const entry: PaymentEntry = {
          doctype: 'Payment Entry',
          payment_type: 'Pay',
          posting_date: m.transaction.date,
          party_type: 'Supplier',
          party: m.matchedInvoice.lieferantName,
          paid_from: m.transaction.account,
          paid_amount: amount,
          references: [
            {
              reference_doctype: 'Purchase Invoice',
              reference_name: m.matchedInvoice.rechnungsnummer,
              allocated_amount: amount,
            },
          ],
        };
        const start = Date.now();
        await fetch(options.paymentEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(options.headers || {}),
          },
          body: JSON.stringify(entry),
        });
        const duration = Date.now() - start;
        logInfo(
          {
            workflow: 'bank-match',
            docType: 'Payment Entry',
            docId: m.matchedInvoice.rechnungsnummer,
            action: 'insert',
            duration_ms: duration,
          },
          'Created payment entry'
        );
      } else {
        logInfo(
          {
            workflow: 'bank-match',
            docType: 'Payment Entry',
            docId: m.matchedInvoice?.rechnungsnummer,
            action: 'noop',
          },
          'No payment entry created'
        );
      }
    }
  }
  return matches;
}
