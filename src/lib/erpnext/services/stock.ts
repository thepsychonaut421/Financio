import type { StockReconciliation, StockEntry } from '../types';

interface Options {
  endpoint: string;
  headers?: Record<string, string>;
}

function buildKey(
  type: 'reconciliation' | 'entry',
  warehouse: string,
  itemCode: string,
  postingDate: string,
): string {
  return `stock:${type}:${warehouse}:${itemCode}:${postingDate}`;
}

export async function createStockReconciliation(
  doc: StockReconciliation,
  options: Options,
): Promise<string> {
  const item = doc.items[0];
  const key = buildKey('reconciliation', item.warehouse, item.item_code, doc.posting_date);
  await fetch(options.endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    body: JSON.stringify({ ...doc, idempotency_key: key }),
  });
  return key;
}

export async function createStockEntry(
  doc: StockEntry,
  options: Options,
): Promise<string> {
  const item = doc.items[0];
  const warehouse = item.s_warehouse || item.t_warehouse || '';
  const key = buildKey('entry', warehouse, item.item_code, doc.posting_date);
  await fetch(options.endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    body: JSON.stringify({ ...doc, idempotency_key: key }),
  });
  return key;
}

export { buildKey as stockKey };
