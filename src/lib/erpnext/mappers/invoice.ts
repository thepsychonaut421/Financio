import type { ERPIncomingInvoiceItem } from '@/types/incoming-invoice';
import type { PurchaseInvoice } from '../types';
import { findExistingPurchaseInvoice } from '../services/dedupe';
import { resolveOrCreateItem } from '../services/sku-resolver';

interface MapperOptions {
  /** When true, no network calls are made. */
  dryRun?: boolean;
  /** Optional endpoint to post the payload to ERPNext. */
  endpoint?: string;
  /** Extra headers for the request such as authentication. */
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

/**
 * Map an internal invoice representation to an ERPNext Purchase Invoice payload
 * and CSV row(s). If `options.dryRun` is false and `options.endpoint` is
 * provided, the payload is POSTed to the given endpoint.
 */
export async function mapPurchaseInvoice(
  invoice: ERPIncomingInvoiceItem,
  options: MapperOptions = {}
): Promise<{ payload: PurchaseInvoice; csv: string; response?: unknown }> {
  const resolvedItems = await Promise.all(
    (invoice.rechnungspositionen || []).map(async item => ({
      ...item,
      itemCode: await resolveOrCreateItem({
        supplierCode: item.productCode,
        name: item.productName,
      }),
    })),
  );

  const payload: PurchaseInvoice = {
    doctype: 'Purchase Invoice',
    supplier: invoice.lieferantName || '',
    bill_no: invoice.rechnungsnummer,
    posting_date: invoice.datum || new Date().toISOString().slice(0, 10),
    due_date: invoice.dueDate,
    currency: invoice.wahrung || 'EUR',
    grand_total: invoice.gesamtbetrag,
    is_paid: invoice.istBezahlt,
    set_posting_time: 1,
    items: resolvedItems.map(item => ({
      item_code: item.itemCode,
      item_name: item.productName,
      description: item.productName,
      qty: item.quantity,
      rate: item.unitPrice,
    })),
  };

  const invoiceData = [
    invoice.lieferantName,
    invoice.rechnungsnummer,
    invoice.datum,
    invoice.gesamtbetrag,
  ].map(escapeCSVField);

  const csvRows: string[] = [];
  if (resolvedItems.length > 0) {
    resolvedItems.forEach(item => {
      const row = [
        ...invoiceData,
        escapeCSVField(item.itemCode),
        escapeCSVField(item.productName),
        item.quantity.toString(),
        item.unitPrice.toString(),
      ];
      csvRows.push(row.join(','));
    });
  } else {
    csvRows.push(invoiceData.join(','));
  }

  if (!options.dryRun && options.endpoint) {
    const existing = await findExistingPurchaseInvoice(payload, {
      endpoint: options.endpoint,
      headers: options.headers,
    });
    if (existing) {
      return {
        payload,
        csv: csvRows.join('\n'),
        response: { duplicate: true, existing },
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
