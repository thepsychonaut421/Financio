import type {
  PurchaseInvoice,
  ItemPayload,
  BankTransaction,
  StockReconciliation,
  StockEntry,
} from '../types';
import {
  purchaseInvoiceKey,
  itemKey,
  bankTransactionKey,
  stockReconciliationKey,
  stockEntryKey,
} from '../idempotency';

type Options = {
  endpoint: string;
  headers?: Record<string, string>;
};

const localCache = new Map<string, Set<string>>();

function markLocal(doctype: string, key: string): boolean {
  let set = localCache.get(doctype);
  if (!set) {
    set = new Set();
    localCache.set(doctype, set);
  }
  if (set.has(key)) return true;
  set.add(key);
  return false;
}

async function queryERPNext(
  endpoint: string,
  filters: unknown[],
  fields: string[],
  headers?: Record<string, string>,
): Promise<any[]> {
  const url = new URL(endpoint);
  url.searchParams.set('filters', JSON.stringify(filters));
  url.searchParams.set('fields', JSON.stringify(fields));
  url.searchParams.set('limit', '20');
  const res = await fetch(url.toString(), { headers });
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data.data) ? data.data : [];
}

export async function findExistingPurchaseInvoice(
  invoice: PurchaseInvoice,
  options: Options,
): Promise<any | undefined> {
  const key = purchaseInvoiceKey(invoice);
  if (markLocal('Purchase Invoice', key)) {
    return { localDuplicate: true };
  }

  const filters = [
    ['Purchase Invoice', 'supplier', '=', invoice.supplier],
    ['Purchase Invoice', 'bill_no', '=', invoice.bill_no],
  ];
  const rows = await queryERPNext(
    options.endpoint,
    filters,
    ['name', 'supplier', 'bill_no', 'posting_date', 'grand_total'],
    options.headers,
  );
  return rows.find(r =>
    purchaseInvoiceKey({
      supplier: r.supplier,
      bill_no: r.bill_no,
      posting_date: r.posting_date,
      grand_total: Number(r.grand_total),
    }) === key,
  );
}

export async function findExistingItem(
  item: ItemPayload,
  options: Options,
): Promise<any | undefined> {
  const key = itemKey(item);
  if (markLocal('Item', key)) {
    return { localDuplicate: true };
  }

  const filters = [['Item', 'item_code', '=', item.item_code]];
  const rows = await queryERPNext(options.endpoint, filters, ['name', 'item_code'], options.headers);
  return rows.find(r => itemKey({ item_code: r.item_code }) === key);
}

export async function findExistingBankTransaction(
  tx: BankTransaction,
  options: Options,
): Promise<any | undefined> {
  const key = bankTransactionKey(tx);
  if (markLocal('Bank Transaction', key)) {
    return { localDuplicate: true };
  }

  const filters = [
    ['Bank Transaction', 'date', '=', tx.date],
    ['Bank Transaction', 'reference_number', '=', tx.reference_number],
  ];
  const rows = await queryERPNext(
    options.endpoint,
    filters,
    ['name', 'date', 'deposit', 'withdrawal', 'reference_number'],
    options.headers,
  );
  return rows.find(r =>
    bankTransactionKey({
      date: r.date,
      deposit: Number(r.deposit),
      withdrawal: Number(r.withdrawal),
      reference_number: r.reference_number,
    }) === key,
  );
}

export function isDuplicateStockReconciliation(doc: StockReconciliation): boolean {
  const key = stockReconciliationKey(doc);
  return markLocal('Stock Reconciliation', key);
}

export function isDuplicateStockEntry(doc: StockEntry): boolean {
  const key = stockEntryKey(doc);
  return markLocal('Stock Entry', key);
}
