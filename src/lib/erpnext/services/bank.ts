import crypto from 'crypto';
import type { BankTransaction, PaymentEntry } from '../types';
import type { ERPIncomingInvoiceItem } from '@/types/incoming-invoice';
import { parseBankCSV, toBankTransactions } from '@/csv/parsers';
import { matchTransactions } from '@/lib/bank-matcher/matchBankToInvoices';
import { findExistingBankTransaction } from './dedupe';

/** Parse CSV text into ERPNext Bank Transaction payloads. */
export function parseCsvLines(csv: string, account: string): BankTransaction[] {
  const rows = parseBankCSV(csv);
  return toBankTransactions(rows, account);
}

function idempotencyKey(tx: BankTransaction): string {
  const amount = tx.deposit ?? (tx.withdrawal ? -tx.withdrawal : 0);
  const refHash = crypto
    .createHash('sha256')
    .update(tx.reference_number || '')
    .digest('hex')
    .slice(0, 8);
  return `bank:${tx.date}:${amount.toFixed(2)}:${refHash}`;
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
  options: Options,
): Promise<string[]> {
  const created: string[] = [];
  for (const tx of transactions) {
    const existing = await findExistingBankTransaction(tx, options);
    if (existing) continue;
    const key = idempotencyKey(tx);
    await fetch(options.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      body: JSON.stringify({ ...tx, idempotency_key: key }),
    });
    created.push(key);
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
  options: Options & { paymentEndpoint?: string; createPayments?: boolean },
) {
  const matches = await matchTransactions(transactions, invoices);
  if (options.createPayments && options.paymentEndpoint) {
    for (const m of matches) {
      if (m.matchedInvoice && m.status === 'Matched') {
        const amount = Math.abs(
          m.transaction.deposit ?? -(m.transaction.withdrawal || 0),
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
        await fetch(options.paymentEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(options.headers || {}),
          },
          body: JSON.stringify(entry),
        });
      }
    }
  }
  return matches;
}

export { idempotencyKey };
