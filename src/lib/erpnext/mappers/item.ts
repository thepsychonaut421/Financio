import type { ItemPayload } from '../types';
import { findExistingItem } from '../services/dedupe';

export interface InternalItem {
  code: string;
  name: string;
  description?: string;
  group: string;
  uom: string;
  isStockItem?: boolean;
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

export async function mapItem(
  item: InternalItem,
  options: MapperOptions = {}
): Promise<{ payload: ItemPayload; csv: string; response?: unknown }> {
  const payload: ItemPayload = {
    doctype: 'Item',
    item_code: item.code,
    item_name: item.name,
    description: item.description,
    item_group: item.group,
    stock_uom: item.uom,
    is_stock_item: item.isStockItem,
  };

  const csv = [
    item.code,
    item.name,
    item.group,
    item.uom,
    item.isStockItem ? 1 : 0,
  ].map(escapeCSVField).join(',');

  if (!options.dryRun && options.endpoint) {
    const existing = await findExistingItem(payload, {
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
