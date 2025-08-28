import type {
  PurchaseInvoice,
  ItemPayload,
  BankTransaction,
  StockReconciliation,
  StockEntry,
} from './types';

function normalise(part: unknown): string {
  if (typeof part === 'number') {
    return part.toFixed(2);
  }
  return String(part ?? '').trim().toLowerCase();
}

export function buildKey(parts: unknown[]): string {
  return parts.map(normalise).join('|');
}

export function purchaseInvoiceKey(
  invoice: Pick<PurchaseInvoice, 'supplier' | 'bill_no' | 'posting_date' | 'grand_total'>,
): string {
  return buildKey([
    invoice.supplier,
    invoice.bill_no,
    invoice.posting_date,
    invoice.grand_total,
  ]);
}

export function itemKey(item: Pick<ItemPayload, 'item_code'>): string {
  return buildKey([item.item_code]);
}

export function bankTransactionKey(
  tx: Pick<BankTransaction, 'date' | 'deposit' | 'withdrawal' | 'reference_number'>,
): string {
  const amount = tx.deposit ?? (tx.withdrawal ? -tx.withdrawal : 0);
  return buildKey([tx.date, amount, tx.reference_number]);
}

export function stockReconciliationKey(
  doc: Pick<StockReconciliation, 'posting_date' | 'items'>,
): string {
  const items = [...doc.items]
    .map(it => buildKey([it.item_code, it.warehouse, it.qty]))
    .sort()
    .join(';');
  return buildKey([doc.posting_date, items]);
}

export function stockEntryKey(
  doc: Pick<StockEntry, 'posting_date' | 'purpose' | 'items'>,
): string {
  const items = [...doc.items]
    .map(it => buildKey([it.item_code, it.s_warehouse, it.t_warehouse, it.qty]))
    .sort()
    .join(';');
  return buildKey([doc.posting_date, doc.purpose, items]);
}

export type IdempotencyKeyBuilder<T> = (doc: T) => string;
