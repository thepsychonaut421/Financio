import type { BankTransaction as InternalBankTransaction } from '@/lib/bank-matcher/types';
import type { BankTransaction } from '../types';
import { findExistingBankTransaction } from '../services/dedupe';

interface MapperOptions {
  dryRun?: boolean;
  endpoint?: string;
  headers?: Record<string, string>;
}

function escapeCSVField(field: string | number | undefined | null): string {
  if (field === undefined || field === null) return '';
  const stringField = String(field);
  if (stringField.includes('"') || stringField.includes(',') || stringField.includes('\n') || stringField.includes('\r')) {
    return `"${stringField.replace(/"/g, '""')}"`;
  }
  return stringField;
}

export async function mapBankTransaction(
  tx: InternalBankTransaction,
  options: MapperOptions = {}
): Promise<{ payload: BankTransaction; csv: string; response?: unknown }> {
  const payload: BankTransaction = {
    doctype: 'Bank Transaction',
    date: tx.date,
    account: tx.recipientOrPayer || '',
    description: tx.description,
    deposit: tx.amount > 0 ? tx.amount : undefined,
    withdrawal: tx.amount < 0 ? Math.abs(tx.amount) : undefined,
    reference_number: tx.id,
    party: tx.recipientOrPayer,
  };

  const csv = [
    tx.date,
    tx.amount > 0 ? tx.amount : '',
    tx.amount < 0 ? Math.abs(tx.amount) : '',
    tx.description,
    tx.id,
    tx.recipientOrPayer,
    tx.currency || 'EUR',
  ].map(escapeCSVField).join(',');

  if (!options.dryRun && options.endpoint) {
    const existing = await findExistingBankTransaction(payload, {
      endpoint: options.endpoint,
      headers: options.headers,
    });
    if (existing) {
      return { payload, csv, response: { duplicate: true, existing } };
    }

    const response = await fetch(options.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
      body: JSON.stringify(payload),
    });
    let data: unknown;
    try {
      data = await response.json();
    } catch {
      data = await response.text();
    }
    return { payload, csv, response: data };
  }

  return { payload, csv };
}
