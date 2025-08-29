import type { BankTransaction as InternalBankTransaction } from '@/lib/bank-matcher/types';
import type { ERPIncomingInvoiceItem } from '@/types/incoming-invoice';
import { mapBankTransaction } from '../lib/erpnext/mappers/bank';
import { mapPurchaseInvoice } from '../lib/erpnext/mappers/invoice';
import { mapItem, type InternalItem } from '../lib/erpnext/mappers/item';
import {
  mapStockEntry,
  mapStockReconciliation,
  type InternalStockEntry,
  type InternalStockReconciliation,
} from '../lib/erpnext/mappers/stock';

/** Determine if the pipeline should emit CSV rows instead of performing API calls. */
function isCsvMode(): boolean {
  return (process.env.FINANCIO_MODE || 'api') === 'csv';
}

/**
 * Convert internal bank transactions to CSV rows using the existing mapper.
 */
export async function bankTransactionsToCsv(
  transactions: InternalBankTransaction[],
): Promise<string> {
  const rows: string[] = [];
  for (const tx of transactions) {
    const { csv } = await mapBankTransaction(tx, { dryRun: true });
    rows.push(csv);
  }
  return rows.join('\n');
}

/**
 * Convert purchase invoices to CSV rows using the existing mapper.
 */
export async function purchaseInvoicesToCsv(
  invoices: ERPIncomingInvoiceItem[],
): Promise<string> {
  const rows: string[] = [];
  for (const invoice of invoices) {
    const { csv } = await mapPurchaseInvoice(invoice, { dryRun: true });
    if (csv) rows.push(csv);
  }
  return rows.join('\n');
}

/**
 * Convert items to CSV rows using the existing mapper.
 */
export async function itemsToCsv(items: InternalItem[]): Promise<string> {
  const rows: string[] = [];
  for (const item of items) {
    const { csv } = await mapItem(item, { dryRun: true });
    rows.push(csv);
  }
  return rows.join('\n');
}

/**
 * Convert stock reconciliations to CSV rows using the existing mapper.
 */
export async function stockReconciliationsToCsv(
  stocks: InternalStockReconciliation[],
): Promise<string> {
  const rows: string[] = [];
  for (const stock of stocks) {
    const { csv } = await mapStockReconciliation(stock, { dryRun: true });
    if (csv) rows.push(csv);
  }
  return rows.join('\n');
}

/**
 * Convert stock entries to CSV rows using the existing mapper.
 */
export async function stockEntriesToCsv(
  entries: InternalStockEntry[],
): Promise<string> {
  const rows: string[] = [];
  for (const entry of entries) {
    const { csv } = await mapStockEntry(entry, { dryRun: true });
    if (csv) rows.push(csv);
  }
  return rows.join('\n');
}

export { isCsvMode };
