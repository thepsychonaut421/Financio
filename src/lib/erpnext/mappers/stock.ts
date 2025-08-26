import type { StockEntry, StockReconciliation } from '../types';
import { isDuplicateStockEntry, isDuplicateStockReconciliation } from '../services/dedupe';

export interface InternalStockReconciliation {
  postingDate: string;
  company?: string;
  purpose?: string;
  items: {
    itemCode: string;
    warehouse: string;
    qty: number;
    valuationRate?: number;
  }[];
}

export interface InternalStockEntry {
  postingDate: string;
  purpose: string;
  company?: string;
  items: {
    itemCode: string;
    sWarehouse?: string;
    tWarehouse?: string;
    qty: number;
    basicRate?: number;
  }[];
}

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

export async function mapStockReconciliation(
  stock: InternalStockReconciliation,
  options: MapperOptions = {}
): Promise<{ payload: StockReconciliation; csv: string; response?: unknown }> {
  const payload: StockReconciliation = {
    doctype: 'Stock Reconciliation',
    posting_date: stock.postingDate,
    company: stock.company,
    purpose: stock.purpose,
    items: stock.items.map(it => ({
      item_code: it.itemCode,
      warehouse: it.warehouse,
      qty: it.qty,
      valuation_rate: it.valuationRate,
    })),
  };

  const csvRows = stock.items.map(it => [
    stock.postingDate,
    stock.company,
    stock.purpose,
    it.itemCode,
    it.warehouse,
    it.qty,
    it.valuationRate ?? '',
  ].map(escapeCSVField).join(','));

  if (!options.dryRun && options.endpoint) {
    if (isDuplicateStockReconciliation(payload)) {
      return {
        payload,
        csv: csvRows.join('\n'),
        response: { duplicate: true },
      };
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
    return { payload, csv: csvRows.join('\n'), response: data };
  }

  return { payload, csv: csvRows.join('\n') };
}

export async function mapStockEntry(
  entry: InternalStockEntry,
  options: MapperOptions = {}
): Promise<{ payload: StockEntry; csv: string; response?: unknown }> {
  const payload: StockEntry = {
    doctype: 'Stock Entry',
    posting_date: entry.postingDate,
    purpose: entry.purpose,
    company: entry.company,
    items: entry.items.map(it => ({
      item_code: it.itemCode,
      s_warehouse: it.sWarehouse,
      t_warehouse: it.tWarehouse,
      qty: it.qty,
      basic_rate: it.basicRate,
    })),
  };

  const csvRows = entry.items.map(it => [
    entry.postingDate,
    entry.purpose,
    entry.company,
    it.itemCode,
    it.sWarehouse || '',
    it.tWarehouse || '',
    it.qty,
    it.basicRate ?? '',
  ].map(escapeCSVField).join(','));

  if (!options.dryRun && options.endpoint) {
    if (isDuplicateStockEntry(payload)) {
      return {
        payload,
        csv: csvRows.join('\n'),
        response: { duplicate: true },
      };
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
    return { payload, csv: csvRows.join('\n'), response: data };
  }

  return { payload, csv: csvRows.join('\n') };
}
