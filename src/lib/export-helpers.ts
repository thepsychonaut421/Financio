
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
    "currency",
    // "credit_to", // Removed as per user request to leave blank
    "is_paid", "remarks",
    "update_stock", "set_posting_time",
    // "naming_series" // Removed as per user request
  ];

  // Standard ERPNext field names for Purchase Invoice Item child table
  const itemHeaders = [
    "item_code",             // From productCode
    "item_name",             // From productName
    "description",           // Can be same as item_name or more detailed
    "qty",                   // From quantity
    "uom",                   // Unit of Measure (e.g., "Nos", "Kg", "Stk")
    "rate",                  // From unitPrice
    "amount",                // Calculated: qty * rate
    "conversion_factor",     // UOM Conversion Factor
    "cost_center",           // Placeholder, can be filled by user
  ];

  const allHeaders = [...invoiceLevelHeaders, ...itemHeaders];
  let csvString = allHeaders.map(escapeCSVField).join(',') + '\n';

  invoices.forEach((invoice, invoiceIndex) => {
    const invoiceLevelDataEscaped = [
      escapeCSVField(invoice.lieferantName),
      escapeCSVField(invoice.rechnungsnummer),
      escapeCSVField(invoice.billDate),
      escapeCSVField(invoice.datum),
      escapeCSVField(invoice.dueDate),
      escapeCSVField(invoice.wahrung || 'EUR'),
      // escapeCSVField(""), // For credit_to, left blank
      escapeCSVField(invoice.istBezahlt?.toString() ?? '0'),
      escapeCSVField(invoice.remarks),
      escapeCSVField('1'),
      escapeCSVField('1'),
      // escapeCSVField(`ACC-PINV-.YYYY.-`), // For naming_series, removed
    ];

    if (invoice.rechnungspositionen && invoice.rechnungspositionen.length > 0) {
      invoice.rechnungspositionen.forEach((item, itemIndex) => {
        const itemCodeValue =
          item.productCode ||
          item.productName ||
          `FALLBACK_ITEM_INV${invoiceIndex + 1}_ITEM${itemIndex + 1}`;
        const itemNameValue = item.productName || item.productCode || `Item from Invoice ${invoice.rechnungsnummer || `INV${invoiceIndex + 1}`}`;
        const itemDescription = itemNameValue; // Default description to item name
        const itemRate = item.unitPrice ?? 0;
        const itemQty = item.quantity ?? 0;
        const itemAmount = itemQty * itemRate;

        const itemDataEscaped = [
          escapeCSVField(itemCodeValue),
          escapeCSVField(itemNameValue),
          escapeCSVField(itemDescription),
          escapeCSVField(itemQty.toString()),
          escapeCSVField("Nos"), // Default UOM
          escapeCSVField(itemRate.toFixed(2)),
          escapeCSVField(itemAmount.toFixed(2)),
          escapeCSVField('1'), // Default Conversion Factor
          escapeCSVField(""),  // Cost Center placeholder
        ];
        csvString += [...invoiceLevelDataEscaped, ...itemDataEscaped].join(',') + '\n';
      });
    } else { // Handle invoices with no line items by creating a placeholder item
      const placeholderItemCode = "DEFAULT_PLACEHOLDER_ITEM";
      const placeholderItemName = `Placeholder Item (Invoice: ${invoice.rechnungsnummer || `INV${invoiceIndex + 1}`})`;
      const placeholderDescription = placeholderItemName;
      const placeholderQty = 1;
      const placeholderRate = invoice.gesamtbetrag !== undefined && invoice.gesamtbetrag !== null ? invoice.gesamtbetrag : 0;
      const placeholderAmount = placeholderRate * placeholderQty;

      const placeholderItemDataEscaped = [
        escapeCSVField(placeholderItemCode),
        escapeCSVField(placeholderItemName),
        escapeCSVField(placeholderDescription),
        escapeCSVField(placeholderQty.toString()),
        escapeCSVField("Nos"), // Default UOM
        escapeCSVField(placeholderRate.toFixed(2)),
        escapeCSVField(placeholderAmount.toFixed(2)),
        escapeCSVField('1'), // Default Conversion Factor
        escapeCSVField(""),  // Cost Center placeholder
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
    "currency", /*"credit_to",*/ "is_paid", "remarks",
    "update_stock", "set_posting_time", /*"naming_series"*/
  ];

  const itemHeadersERP = [
    "item_code", "item_name", "description", "qty", "uom",
    "rate", "amount", "conversion_factor", "cost_center"
  ];
  
  const standardModeHeaders = [
    'PDF Datei', 'Rechnungsnummer', 'Datum', 'Lieferant Name', 'Lieferant Adresse',
    'Zahlungsziel', 'Zahlungsart', 'Gesamtbetrag', 'MwSt-Satz', 'Kunden-Nr.', 'Bestell-Nr.',
    'Pos. Produkt Code', 'Pos. Produkt Name', 'Pos. Menge', 'Pos. Einzelpreis'
  ];


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
      // "", // credit_to
      invoice.istBezahlt?.toString() ?? '0',
      invoice.remarks,
      '1', 
      '1',
      // `ACC-PINV-.YYYY.-` // naming_series
    ];
    const invoiceLevelDataEscaped = invoiceLevelData.map(f => escapeTSVField(f));

    if (erpMode) {
        if (invoice.rechnungspositionen && invoice.rechnungspositionen.length > 0) {
            invoice.rechnungspositionen.forEach((item, itemIndex) => {
            const itemCodeValue = item.productCode || item.productName || `FALLBACK_ITEM_INV${invoiceIndex + 1}_ITEM${itemIndex + 1}`;
            const itemNameValue = item.productName || item.productCode || `Item for Invoice ${invoice.rechnungsnummer || `INV${invoiceIndex + 1}`}`;
            const itemDescription = itemNameValue;
            const itemRate = item.unitPrice ?? 0;
            const itemQty = item.quantity ?? 0;
            const itemAmount = itemQty * itemRate;

            const itemData = [
                itemCodeValue,
                itemNameValue,
                itemDescription,
                itemQty.toString(),
                "Nos",
                itemRate.toFixed(2),
                itemAmount.toFixed(2),
                '1',
                "" // Cost Center
            ];
            const itemDataEscaped = itemData.map(f => escapeTSVField(f));
            tsvString += [...invoiceLevelDataEscaped, ...itemDataEscaped].join('\t') + '\n';
            });
        } else { // Placeholder for invoices with no items
            const placeholderItemCode = "DEFAULT_PLACEHOLDER_ITEM";
            const placeholderItemName = `Placeholder Item (Invoice: ${invoice.rechnungsnummer || `INV${invoiceIndex + 1}`})`;
            const placeholderDescription = placeholderItemName;
            const placeholderQty = 1;
            const placeholderRate = invoice.gesamtbetrag !== undefined && invoice.gesamtbetrag !== null ? invoice.gesamtbetrag : 0;
            const placeholderAmount = placeholderRate * placeholderQty;
            
            const placeholderItemDataEscaped = [
                escapeTSVField(placeholderItemCode),
                escapeTSVField(placeholderItemName),
                escapeTSVField(placeholderDescription),
                escapeTSVField(placeholderQty.toString()),
                escapeTSVField("Nos"),
                escapeTSVField(placeholderRate.toFixed(2)),
                escapeTSVField(placeholderAmount.toFixed(2)),
                escapeTSVField('1'),
                escapeTSVField(""), // Cost Center
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

  // "Formula perfecta" headers from user image
  const supplierHeaders = [
    "ID", 
    "Supplier Name",
    "Supplier Type", 
    "Tax ID",
    "Primary Address", // From "Primary Addr" in user image
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
      "Company", 
      taxIdValue,
      invoice.lieferantAdresse, // Maps to "Primary Address"
      "", // Email Id (blank)
      "", // Mobile No (blank)
      "", // Website (blank)
    ];
    csvString += supplierDataRow.map(escapeCSVField).join(',') + '\n';
  });

  return csvString;
}

// OLDER Supplier export - keep for reference or specific needs if any
export function erpInvoicesToSupplierCSVSimplified(invoices: ERPIncomingInvoiceItem[]): string {
  if (!invoices || invoices.length === 0) return '';

  const supplierHeaders = [
    "ID", 
    "Supplier Name",
    "Supplier Type", 
    "Supplier Group",
    "Country",
    "Tax ID",
    "Address Line 1", // Changed from "Primary Address" to be more generic if needed
    "Email ID",
    "Mobile No",
    "Website",
    "Supplier Details", // Notes field
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
      "Company", 
      "All Supplier", // Corrected value
      "Germany", // Default Country
      taxIdValue,
      invoice.lieferantAdresse,
      "", // Email Id (blank)
      "", // Mobile No (blank)
      "", // Website (blank)
      invoice.remarks || "", // Supplier Details from invoice remarks
    ];
    csvString += supplierDataRow.map(escapeCSVField).join(',') + '\n';
  });

  return csvString;
}

