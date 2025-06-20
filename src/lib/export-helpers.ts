
'use client';

import type { IncomingInvoiceItem, ERPIncomingInvoiceItem } from '@/types/incoming-invoice';
import { format as formatDateFns, parseISO, isValid } from 'date-fns';

export function downloadFile(content: string | Blob, fileName: string, mimeType: string): void {
  const blob = typeof content === 'string' ? new Blob([content], { type: mimeType }) : content;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function escapeCSVField(field: string | number | undefined | null): string {
  if (field === undefined || field === null) return '';
  const stringField = String(field);
  if (stringField.includes('"') || stringField.includes(',') || stringField.includes('\n') || stringField.includes('\r')) {
    return `"${stringField.replace(/"/g, '""')}"`;
  }
  return stringField;
}

export function incomingInvoicesToCSV(invoices: IncomingInvoiceItem[]): string {
  if (!invoices || invoices.length === 0) return '';

  const mainHeaders = [
    'PDF Datei',
    'Rechnungsnummer',
    'Datum',
    'Lieferant Name',
    'Lieferant Adresse',
    'Zahlungsziel',
    'Zahlungsart',
    'Gesamtbetrag',
    'MwSt-Satz',
    'Kunden-Nr.',
    'Bestell-Nr.'
  ];
  const itemHeaders = ['Pos. Produkt Code', 'Pos. Produkt Name', 'Pos. Menge', 'Pos. Einzelpreis'];

  let csvString = mainHeaders.join(',') + ',' + itemHeaders.join(',') + '\n';

  invoices.forEach((invoice) => {
    const mainInvoiceData = [
      escapeCSVField(invoice.pdfFileName),
      escapeCSVField(invoice.rechnungsnummer),
      escapeCSVField(invoice.datum),
      escapeCSVField(invoice.lieferantName),
      escapeCSVField(invoice.lieferantAdresse),
      escapeCSVField(invoice.zahlungsziel),
      escapeCSVField(invoice.zahlungsart),
      invoice.gesamtbetrag?.toString() ?? '',
      escapeCSVField(invoice.mwstSatz),
      escapeCSVField(invoice.kundenNummer),
      escapeCSVField(invoice.bestellNummer),
    ];

    if (invoice.rechnungspositionen && invoice.rechnungspositionen.length > 0) {
      invoice.rechnungspositionen.forEach(item => {
        const itemData = [
          escapeCSVField(item.productCode),
          escapeCSVField(item.productName),
          item.quantity.toString(),
          item.unitPrice.toString(),
        ];
        csvString += mainInvoiceData.join(',') + ',' + itemData.join(',') + '\n';
      });
    } else {
      const emptyItemData = Array(itemHeaders.length).fill('');
      csvString += mainInvoiceData.join(',') + ',' + emptyItemData.join(',') + '\n';
    }
  });

  return csvString;
}


export function incomingInvoicesToERPNextCSVComplete(invoices: ERPIncomingInvoiceItem[]): string {
  if (!invoices || invoices.length === 0) return '';

  const invoiceLevelHeaders = [
    "supplier", "bill_no", "bill_date", "posting_date", "due_date",
    "currency", "credit_to", "is_paid", "remarks",
    "update_stock", "set_posting_time",
  ];

  // Item Level Headers based on user's "perfect formula" image
  const itemHeaders = [
    "ID (Items)",
    "Accepted Qty (Items)",
    "Accepted Qty in Stock UOM (Items)",
    "Amount (Items)",
    "Amount (Company Currency) (Items)",
    "Item Name (Items)",
    "Rate (Items)",
    "Rate (Company Currency) (Items)",
    "UOM (Items)",
    "UOM Conversion Factor (Items)",
    "items.expense_account" // Crucial field from user's image
  ];

  const allHeaders = [...invoiceLevelHeaders, ...itemHeaders];
  let csvString = allHeaders.map(escapeCSVField).join(',') + '\n';

  const DEFAULT_EXPENSE_ACCOUNT = "6000 - Wareneingang"; // As per user feedback and image

  invoices.forEach((invoice, invoiceIndex) => {
    const invoiceLevelDataEscaped = [
      escapeCSVField(invoice.lieferantName),
      escapeCSVField(invoice.rechnungsnummer),
      escapeCSVField(invoice.billDate), // Should be YYYY-MM-DD
      escapeCSVField(invoice.datum),    // Should be YYYY-MM-DD (posting_date)
      escapeCSVField(invoice.dueDate),  // Should be YYYY-MM-DD
      escapeCSVField(invoice.wahrung || 'EUR'),
      escapeCSVField(""), // credit_to is left blank
      escapeCSVField(invoice.istBezahlt?.toString() ?? '0'),
      escapeCSVField(invoice.remarks),
      escapeCSVField('1'), // update_stock
      escapeCSVField('1'), // set_posting_time
    ];

    if (invoice.rechnungspositionen && invoice.rechnungspositionen.length > 0) {
      invoice.rechnungspositionen.forEach((item, itemIndex) => {
        const itemCodeValue = item.productCode || item.productName || `FALLBACK_ITEM_INV${invoiceIndex + 1}_ITEM${itemIndex + 1}`;
        const itemNameValue = item.productName || item.productCode || `Item from Invoice ${invoice.rechnungsnummer || `INV${invoiceIndex + 1}`}`;
        const itemRate = item.unitPrice ?? 0;
        const itemQty = item.quantity ?? 0;
        const itemAmount = itemQty * itemRate;

        const itemDataEscaped = [
          escapeCSVField(itemCodeValue),                       // ID (Items)
          escapeCSVField(itemQty.toString()),                  // Accepted Qty (Items)
          escapeCSVField(itemQty.toString()),                  // Accepted Qty in Stock UOM (Items)
          escapeCSVField(itemAmount.toFixed(2)),               // Amount (Items)
          escapeCSVField(itemAmount.toFixed(2)),               // Amount (Company Currency) (Items) - Assuming invoice currency = company currency
          escapeCSVField(itemNameValue),                       // Item Name (Items)
          escapeCSVField(itemRate.toFixed(2)),                 // Rate (Items)
          escapeCSVField(itemRate.toFixed(2)),                 // Rate (Company Currency) (Items) - Assuming invoice currency = company currency
          escapeCSVField("Stk"),                               // UOM (Items) - Default to "Stk" or "Nos"
          escapeCSVField('1'),                                 // UOM Conversion Factor (Items)
          escapeCSVField(DEFAULT_EXPENSE_ACCOUNT)              // items.expense_account
        ];
        csvString += [...invoiceLevelDataEscaped, ...itemDataEscaped].join(',') + '\n';
      });
    } else {
      // Placeholder item for invoices without lines
      const placeholderItemCode = "DEFAULT_PLACEHOLDER_ITEM";
      const placeholderItemName = `Placeholder Item (Invoice: ${invoice.rechnungsnummer || `INV${invoiceIndex + 1}`})`;
      const placeholderQty = 1;
      const placeholderRate = invoice.gesamtbetrag !== undefined && invoice.gesamtbetrag !== null ? invoice.gesamtbetrag : 0;
      const placeholderAmount = placeholderRate * placeholderQty;

      const placeholderItemDataEscaped = [
        escapeCSVField(placeholderItemCode),                  // ID (Items)
        escapeCSVField(placeholderQty.toString()),            // Accepted Qty (Items)
        escapeCSVField(placeholderQty.toString()),            // Accepted Qty in Stock UOM (Items)
        escapeCSVField(placeholderAmount.toFixed(2)),         // Amount (Items)
        escapeCSVField(placeholderAmount.toFixed(2)),         // Amount (Company Currency) (Items)
        escapeCSVField(placeholderItemName),                  // Item Name (Items)
        escapeCSVField(placeholderRate.toFixed(2)),           // Rate (Items)
        escapeCSVField(placeholderRate.toFixed(2)),           // Rate (Company Currency) (Items)
        escapeCSVField("Nos"),                                // UOM (Items)
        escapeCSVField('1'),                                  // UOM Conversion Factor (Items)
        escapeCSVField(DEFAULT_EXPENSE_ACCOUNT)               // items.expense_account
      ];
      csvString += [...invoiceLevelDataEscaped, ...placeholderItemDataEscaped].join(',') + '\n';
    }
  });
  return csvString;
}


export function incomingInvoicesToJSON(invoices: IncomingInvoiceItem[] | ERPIncomingInvoiceItem[]): string {
  return JSON.stringify(invoices, null, 2);
}

function escapeTSVField(field: string | number | undefined | null): string {
  if (field === undefined || field === null) return '';
  return String(field).replace(/\t/g, ' ').replace(/\n/g, ' ').replace(/\r/g, ' ');
}

export function incomingInvoicesToTSV(invoices: IncomingInvoiceItem[] | ERPIncomingInvoiceItem[], erpMode: boolean): string {
  if (!invoices || invoices.length === 0) return '';
  let tsvString = '';

  const erpInvoices = invoices as ERPIncomingInvoiceItem[];

  const invoiceLevelHeadersERP = [
    "supplier", "bill_no", "bill_date", "posting_date", "due_date",
    "currency", "credit_to", "is_paid", "remarks",
    "update_stock", "set_posting_time",
  ];

  const itemHeadersERP = [ // Based on user's "perfect formula" image
    "ID (Items)",
    "Accepted Qty (Items)",
    "Accepted Qty in Stock UOM (Items)",
    "Amount (Items)",
    "Amount (Company Currency) (Items)",
    "Item Name (Items)",
    "Rate (Items)",
    "Rate (Company Currency) (Items)",
    "UOM (Items)",
    "UOM Conversion Factor (Items)",
    "items.expense_account"
  ];
  
  const standardModeHeaders = [
    'PDF Datei', 'Rechnungsnummer', 'Datum', 'Lieferant Name', 'Lieferant Adresse',
    'Zahlungsziel', 'Zahlungsart', 'Gesamtbetrag', 'MwSt-Satz', 'Kunden-Nr.', 'Bestell-Nr.',
    'Pos. Produkt Code', 'Pos. Produkt Name', 'Pos. Menge', 'Pos. Einzelpreis'
  ];

  const DEFAULT_EXPENSE_ACCOUNT_TSV = "6000 - Wareneingang";


  const headers = erpMode ? [...invoiceLevelHeadersERP, ...itemHeadersERP] : standardModeHeaders;
  tsvString = headers.map(h => escapeTSVField(h)).join('\t') + '\n';

  erpInvoices.forEach((invoice, invoiceIndex) => {
    const invoiceLevelData = [
      invoice.lieferantName,
      invoice.rechnungsnummer,
      invoice.billDate,
      invoice.datum, 
      invoice.dueDate,
      invoice.wahrung || 'EUR',
      "", // credit_to
      invoice.istBezahlt?.toString() ?? '0',
      invoice.remarks,
      '1', 
      '1',
    ];
    const invoiceLevelDataEscaped = invoiceLevelData.map(f => escapeTSVField(f));

    if (erpMode) {
        if (invoice.rechnungspositionen && invoice.rechnungspositionen.length > 0) {
            invoice.rechnungspositionen.forEach((item, itemIndex) => {
            const itemCodeValue = item.productCode || item.productName || `FALLBACK_ITEM_INV${invoiceIndex + 1}_ITEM${itemIndex + 1}`;
            const itemNameValue = item.productName || item.productCode || `Item for Invoice ${invoice.rechnungsnummer || `INV${invoiceIndex + 1}`}`;
            const itemRate = item.unitPrice ?? 0;
            const itemQty = item.quantity ?? 0;
            const itemAmount = itemQty * itemRate;

            const itemData = [
                itemCodeValue,                       // ID (Items)
                itemQty.toString(),                  // Accepted Qty (Items)
                itemQty.toString(),                  // Accepted Qty in Stock UOM (Items)
                itemAmount.toFixed(2),               // Amount (Items)
                itemAmount.toFixed(2),               // Amount (Company Currency) (Items)
                itemNameValue,                       // Item Name (Items)
                itemRate.toFixed(2),                 // Rate (Items)
                itemRate.toFixed(2),                 // Rate (Company Currency) (Items)
                "Stk",                               // UOM (Items)
                '1',                                 // UOM Conversion Factor (Items)
                DEFAULT_EXPENSE_ACCOUNT_TSV          // items.expense_account
            ];
            const itemDataEscaped = itemData.map(f => escapeTSVField(f));
            tsvString += [...invoiceLevelDataEscaped, ...itemDataEscaped].join('\t') + '\n';
            });
        } else { 
            const placeholderItemCode = "DEFAULT_PLACEHOLDER_ITEM";
            const placeholderItemName = `Placeholder Item (Invoice: ${invoice.rechnungsnummer || `INV${invoiceIndex + 1}`})`;
            const placeholderQty = 1;
            const placeholderRate = invoice.gesamtbetrag !== undefined && invoice.gesamtbetrag !== null ? invoice.gesamtbetrag : 0;
            const placeholderAmount = placeholderRate * placeholderQty;
            
            const placeholderItemDataEscaped = [
                escapeTSVField(placeholderItemCode),                  // ID (Items)
                escapeTSVField(placeholderQty.toString()),            // Accepted Qty (Items)
                escapeTSVField(placeholderQty.toString()),            // Accepted Qty in Stock UOM (Items)
                escapeTSVField(placeholderAmount.toFixed(2)),         // Amount (Items)
                escapeTSVField(placeholderAmount.toFixed(2)),         // Amount (Company Currency) (Items)
                escapeTSVField(placeholderItemName),                  // Item Name (Items)
                escapeTSVField(placeholderRate.toFixed(2)),           // Rate (Items)
                escapeTSVField(placeholderRate.toFixed(2)),           // Rate (Company Currency) (Items)
                escapeTSVField("Nos"),                                // UOM (Items)
                escapeTSVField('1'),                                  // UOM Conversion Factor (Items)
                escapeTSVField(DEFAULT_EXPENSE_ACCOUNT_TSV)           // items.expense_account
            ];
            tsvString += [...invoiceLevelDataEscaped, ...placeholderItemDataEscaped].join('\t') + '\n';
        }
    } else {
        const regularInvoice = invoice as IncomingInvoiceItem;
        const mainInvoiceDataStd = [
            regularInvoice.pdfFileName,
            regularInvoice.rechnungsnummer,
            regularInvoice.datum,
            regularInvoice.lieferantName,
            regularInvoice.lieferantAdresse,
            regularInvoice.zahlungsziel,
            regularInvoice.zahlungsart,
            regularInvoice.gesamtbetrag?.toString() ?? '',
            regularInvoice.mwstSatz,
            regularInvoice.kundenNummer,
            regularInvoice.bestellNummer,
        ].map(f => escapeTSVField(f));

        if (regularInvoice.rechnungspositionen && regularInvoice.rechnungspositionen.length > 0) {
            regularInvoice.rechnungspositionen.forEach(item => {
            const itemData = [
                item.productCode,
                item.productName,
                item.quantity.toString(),
                item.unitPrice.toString(),
            ].map(f => escapeTSVField(f));
            tsvString += [...mainInvoiceDataStd, ...itemData].join('\t') + '\n';
            });
        } else {
            const emptyItemData = Array(4).fill('').map(f => escapeTSVField(f));
            tsvString += [...mainInvoiceDataStd, ...emptyItemData].join('\t') + '\n';
        }
    }
  });
  return tsvString;
}


export function erpInvoicesToSupplierCSV(invoices: ERPIncomingInvoiceItem[]): string {
  if (!invoices || invoices.length === 0) return '';

  // "Formula perfecta" headers based on user's visual feedback
  const supplierHeaders = [
    "ID", // Will be blank, ERPNext generates this on import
    "Supplier Name",
    "Supplier Type",
    "Tax ID",
    "Primary Address", // Changed from "Address Line 1" to match image implications
    "Email Id", 
    "Mobile No", 
    "Website" 
  ];

  let csvString = supplierHeaders.map(escapeCSVField).join(',') + '\n';

  const uniqueSuppliers = new Map<string, ERPIncomingInvoiceItem>();
  invoices.forEach(invoice => {
    const supplierKey = (invoice.lieferantName || `UNKNOWN_SUPPLIER_${invoice.pdfFileName || 'PDF'}`).trim().toUpperCase();
    if (supplierKey && !uniqueSuppliers.has(supplierKey) && supplierKey !== "UNBEKANNT_SUPPLIER_PLACEHOLDER" && supplierKey !== "UNBEKANNT") {
      uniqueSuppliers.set(supplierKey, invoice);
    }
  });

  uniqueSuppliers.forEach(invoice => {
    let taxIdValue = "";
    if (invoice.remarks) { 
        const taxIdMatch = invoice.remarks.match(/Tax ID:\s*([^\s\/,]+)/i) ||
                           invoice.remarks.match(/VAT ID:\s*([^\s\/,]+)/i) ||
                           invoice.remarks.match(/USt-IdNr.:\s*([^\s\/,]+)/i);
        if (taxIdMatch && taxIdMatch[1]) {
            taxIdValue = taxIdMatch[1];
        }
    }

    const supplierDataRow = [
      "", // ID (blank for new)
      invoice.lieferantName,
      "Company", // Supplier Type
      taxIdValue, // Tax ID
      invoice.lieferantAdresse, // Primary Address
      "", // Email Id (blank)
      "", // Mobile No (blank)
      "", // Website (blank)
    ];
    csvString += supplierDataRow.map(escapeCSVField).join(',') + '\n';
  });

  return csvString;
}

    