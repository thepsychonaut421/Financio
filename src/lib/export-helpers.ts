

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
  if (field === undefined || field === null) return '""';
  let stringField = String(field);

  // Force treatment as text in Excel for long numbers
  if (/^\d+$/.test(stringField) && stringField.length >= 10) {
    stringField = "'" + stringField;
  }

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

  const allHeaders = [
    "ID",
    "Series",
    "Supplier",
    "Date",
    "Credit To",
    "Supplier Invoice No",
    "Supplier Invoice Date",
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
    "items.expense_account",
  ];
  
  let csvString = allHeaders.map(escapeCSVField).join(',') + '\n';

  const DEFAULT_EXPENSE_ACCOUNT = "6000 - Warenaufwand - BRUG";
  const DEFAULT_UOM = "Stk";
  const DEFAULT_CONVERSION_FACTOR = '1';

  invoices.forEach((invoice, invoiceIndex) => {
      const itemsToProcess = (invoice.rechnungspositionen && invoice.rechnungspositionen.length > 0)
        ? invoice.rechnungspositionen
        : [{ 
            productCode: "DEFAULT_PLACEHOLDER_ITEM",
            productName: `Invoice Total: ${invoice.rechnungsnummer || `INV${invoiceIndex + 1}`}`,
            quantity: 1,
            unitPrice: invoice.gesamtbetrag ?? 0,
        }];

      itemsToProcess.forEach((item, itemIndex) => {
          let invoiceLevelData;
          if (itemIndex === 0) {
              invoiceLevelData = [
                  '""', // ID - Leave blank for new documents
                  '""', // Series - Leave blank to use default
                  escapeCSVField(invoice.lieferantName),
                  escapeCSVField(invoice.datum),
                  escapeCSVField(invoice.kontenrahmen),
                  escapeCSVField(invoice.rechnungsnummer),
                  escapeCSVField(invoice.datum),
              ];
          } else {
              invoiceLevelData = ['', '', '', '', '', '', ''];
          }

          const itemCodeValue = item.productCode || item.productName || `FALLBACK_ITEM_INV${invoiceIndex + 1}_ITEM${itemIndex + 1}`;
          const itemNameValue = item.productName || item.productCode || `Item from Invoice ${invoice.rechnungsnummer || `INV${invoiceIndex + 1}`}`;
          const itemRate = item.unitPrice ?? 0;
          const itemQty = item.quantity ?? 0;
          const itemAmount = itemQty * itemRate;

          const itemData = [
              escapeCSVField(itemCodeValue),
              escapeCSVField(itemQty.toString()),
              escapeCSVField(itemQty.toString()), // Accepted Qty in Stock UOM
              escapeCSVField(itemAmount.toFixed(2)),
              escapeCSVField(itemAmount.toFixed(2)), // Amount (Company Currency)
              escapeCSVField(itemNameValue),
              escapeCSVField(itemRate.toFixed(2)),
              escapeCSVField(itemRate.toFixed(2)), // Rate (Company Currency)
              escapeCSVField(DEFAULT_UOM),
              escapeCSVField(DEFAULT_CONVERSION_FACTOR),
              escapeCSVField(DEFAULT_EXPENSE_ACCOUNT)
          ];

          csvString += [...invoiceLevelData, ...itemData].join(',') + '\n';
      });
  });
  return csvString;
}


export function incomingInvoicesToJSON(invoices: IncomingInvoiceItem[] | ERPIncomingInvoiceItem[]): string {
  return JSON.stringify(invoices, null, 2);
}

function escapeTSVField(field: string | number | undefined | null): string {
  if (field === undefined || field === null) return '';
  let stringField = String(field);
  
  return stringField.replace(/\t/g, ' ').replace(/\n/g, ' ').replace(/\r/g, ' ');
}

export function incomingInvoicesToTSV(invoices: (IncomingInvoiceItem | ERPIncomingInvoiceItem)[], erpMode: boolean): string {
  if (!invoices || invoices.length === 0) return '';
  let tsvString = '';

  const erpHeaders = [
    "ID",
    "Series",
    "Supplier",
    "Date",
    "Credit To",
    "Supplier Invoice No",
    "Supplier Invoice Date",
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
    "items.expense_account",
  ];
  
  const standardModeHeaders = [
    'PDF Datei', 'Rechnungsnummer', 'Datum', 'Lieferant Name', 'Lieferant Adresse',
    'Zahlungsziel', 'Zahlungsart', 'Gesamtbetrag', 'MwSt-Satz', 'Kunden-Nr.', 'Bestell-Nr.',
    'Pos. Produkt Code', 'Pos. Produkt Name', 'Pos. Menge', 'Pos. Einzelpreis'
  ];

  const DEFAULT_EXPENSE_ACCOUNT_TSV = "6000 - Warenaufwand - BRUG";
  const DEFAULT_UOM_TSV = "Stk";
  const DEFAULT_CONVERSION_FACTOR_TSV = '1';


  const headers = erpMode ? erpHeaders : standardModeHeaders;
  tsvString = headers.map(h => escapeTSVField(h)).join('\t') + '\n';

  invoices.forEach((invoice, invoiceIndex) => {
    if (erpMode) {
        const erpInvoice = invoice as ERPIncomingInvoiceItem;
        const itemsToProcess = (erpInvoice.rechnungspositionen && erpInvoice.rechnungspositionen.length > 0)
            ? erpInvoice.rechnungspositionen
            : [{ 
                productCode: "DEFAULT_PLACEHOLDER_ITEM",
                productName: `Invoice Total: ${erpInvoice.rechnungsnummer || `INV${invoiceIndex + 1}`}`,
                quantity: 1,
                unitPrice: erpInvoice.gesamtbetrag ?? 0,
            }];
        
        itemsToProcess.forEach((item, itemIndex) => {
            let invoiceLevelData;
            if (itemIndex === 0) {
                // First row gets details
                invoiceLevelData = [
                    "", // ID - Leave blank
                    "", // Series - Leave blank
                    erpInvoice.lieferantName,
                    erpInvoice.datum,
                    erpInvoice.kontenrahmen,
                    erpInvoice.rechnungsnummer,
                    erpInvoice.datum,
                ].map(f => escapeTSVField(f));
            } else {
                // Subsequent rows are blank
                invoiceLevelData = ['', '', '', '', '', '', ''];
            }

            const itemCodeValue = item.productCode || item.productName || `FALLBACK_ITEM_INV${invoiceIndex + 1}_ITEM${itemIndex + 1}`;
            const itemNameValue = item.productName || item.productCode || `Item for Invoice ${erpInvoice.rechnungsnummer || `INV${invoiceIndex + 1}`}`;
            const itemRate = item.unitPrice ?? 0;
            const itemQty = item.quantity ?? 0;
            const itemAmount = itemQty * itemRate;

            const itemData = [
                itemCodeValue,
                itemQty.toString(),
                itemQty.toString(),
                itemAmount.toFixed(2),
                itemAmount.toFixed(2),
                itemNameValue,
                itemRate.toFixed(2),
                itemRate.toFixed(2),
                DEFAULT_UOM_TSV,
                DEFAULT_CONVERSION_FACTOR_TSV,
                DEFAULT_EXPENSE_ACCOUNT_TSV
            ].map(f => escapeTSVField(f));

            tsvString += [...invoiceLevelData, ...itemData].join('\t') + '\n';
        });

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

  const supplierHeaders = [
    "ID",
    "Supplier Name",
    "Supplier Type",
    "Tax ID",
    "Primary Address",
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
