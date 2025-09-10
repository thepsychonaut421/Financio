import type { StockEntry, StockReconciliation } from '../types';
import { isDuplicateStockEntry, isDuplicateStockReconciliation } from '../services/dedupe';
import { resolveOrCreateItem } from '../services/sku-resolver';

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
  purpose: "Material Receipt"; // This is now fixed for our use case
  company?: string;
  items: {
    itemCode: string;
    sWarehouse?: string; // Source warehouse, not needed for Material Receipt
    tWarehouse?: string; // Target warehouse
    qty: number;
    basicRate?: number; // Valuation rate
  }[];
}

interface MapperOptions {
  dryRun?: boolean;
  endpoint?: string;
  headers?: Record<string, string>;
}

function shouldPost(options: MapperOptions): boolean {
  const mode = process.env.FINANCIO_MODE || 'api';
  return mode === 'api' && !options.dryRun && Boolean(options.endpoint);
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
    const resolvedItems = await Promise.all(
      stock.items.map(async it => ({
        ...it,
        itemCode: await resolveOrCreateItem({
          supplierCode: it.itemCode,
          name: it.itemCode,
        }),
      }))
    );

    const payload: StockReconciliation = {
      doctype: 'Stock Reconciliation',
      posting_date: stock.postingDate,
      company: stock.company,
      purpose: stock.purpose,
      items: resolvedItems.map(it => ({
        item_code: it.itemCode,
        warehouse: it.warehouse,
        qty: it.qty,
        valuation_rate: it.valuationRate,
      })),
    };

    const csvRows = resolvedItems.map(it => [
      stock.postingDate,
      stock.company,
      stock.purpose,
      it.itemCode,
      it.warehouse,
      it.qty,
      it.valuationRate ?? '',
    ].map(escapeCSVField).join(','));

  if (shouldPost(options)) {
    if (isDuplicateStockReconciliation(payload)) {
      return {
        payload,
        csv: csvRows.join('\n'),
        response: { duplicate: true },
      };
    }

    const response = await fetch(options.endpoint!, {
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
  const resolvedItems = await Promise.all(
    entry.items.map(async it => ({
      ...it,
      itemCode: await resolveOrCreateItem({
        supplierCode: it.itemCode,
        name: it.itemCode,
      }),
    })),
  );

  const payload: StockEntry = {
    doctype: 'Stock Entry',
    posting_date: entry.postingDate,
    stock_entry_type: entry.purpose, // Use purpose for stock_entry_type
    company: entry.company,
    items: resolvedItems.map(it => ({
      item_code: it.itemCode,
      s_warehouse: it.sWarehouse, // Should be undefined for Material Receipt
      t_warehouse: it.tWarehouse, // Target warehouse
      qty: it.qty,
      basic_rate: it.basicRate,
    })),
  };
  
  const today = new Date().toISOString().slice(0, 10);

  const csvRows = resolvedItems.map((it, index) => [
    index === 0 ? `MAT-STE-${today.replace(/-/g, '')}-` : '',
    index === 0 ? 'MAT-STE-.YYYY.-' : '',
    index === 0 ? entry.purpose : '',
    index === 0 ? entry.company : '',
    index === 0 ? entry.postingDate : '',
    it.itemCode,
    it.qty,
    "Stk", // UOM
    it.tWarehouse,
    "1" // is_finished_item
  ].map(escapeCSVField).join(','));
  
  const csvHeader = "ID,Series,Stock Entry Type,Company,Posting Date,Item Code (Items),Qty (Items),UOM (Items),Target Warehouse (Items),Is Finished Item (Items)";
  const csv = [csvHeader, ...csvRows].join('\n');


  if (shouldPost(options)) {
    if (isDuplicateStockEntry(payload)) {
      return {
        payload,
        csv,
        response: { duplicate: true },
      };
    }

      const response = await fetch(options.endpoint!, {
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
