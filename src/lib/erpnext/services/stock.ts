import type { StockReconciliation, StockEntry } from '../types';

interface Options {
  endpoint: string;
  headers?: Record<string, string>;
}

type StockDocType = 'reconciliation' | 'entry';

/**
 * Build the idempotency key used for stock operations.
 * The format is: `stock:{type}:{warehouse}:{item_code}:{posting_date}`
 */
export function stockKey(
  type: StockDocType,
  warehouse: string,
  itemCode: string,
  postingDate: string,
): string {
  return `stock:${type}:${warehouse}:${itemCode}:${postingDate}`;
}

async function postStockDocument(
  doc: StockReconciliation | StockEntry,
  key: string,
  options: Options,
): Promise<void> {
  await fetch(options.endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    body: JSON.stringify({ ...doc, idempotency_key: key }),
  });
}

export async function createStockReconciliation(
  doc: StockReconciliation,
  options: Options,
): Promise<string> {
  const item = doc.items[0];
  const key = stockKey('reconciliation', item.warehouse, item.item_code, doc.posting_date);
  await postStockDocument(doc, key, options);
  return key;
}

export async function createStockEntry(
  doc: StockEntry,
  options: Options,
): Promise<string> {
  const item = doc.items[0];
  const warehouse = item.s_warehouse || item.t_warehouse || '';
  const key = stockKey('entry', warehouse, item.item_code, doc.posting_date);
  await postStockDocument(doc, key, options);
  return key;
}
