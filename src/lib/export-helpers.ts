
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

// This function is not directly used by ERPNext export but kept for standard CSV.
function formatDateToMMDDYY(dateString?: string): string {
  if (!dateString) return '';
  try {
    // Assuming dateString is already YYYY-MM-DD from formatDateForERP
    const date = parseISO(dateString);
    if (isValid(date)) {
      return formatDateFns(date, 'MM/dd/yy');
    }
  } catch (e) { /* ignore */ }
  // Fallback if already in a different format or parsing fails
  return dateString;
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
      // If no items, just write the main invoice data with empty item fields
      const emptyItemData = Array(itemHeaders.length).fill('');
      csvString += mainInvoiceData.join(',') + ',' + emptyItemData.join(',') + '\n';
    }
  });

  return csvString;
}


export function incomingInvoicesToERPNextCSVComplete(invoices: ERPIncomingInvoiceItem[]): string {
  if (!invoices || invoices.length === 0) return '';

  const invoiceLevelHeaders = [
    // "ID" column removed - ERPNext will assign
    // "naming_series" column removed - ERPNext will use default
    "supplier", "bill_no", "bill_date", "posting_date", "due_date",
    "currency",
    "credit_to", // Kept blank as requested
    "is_paid", "remarks",
    "update_stock", "set_posting_time",
  ];

  const itemHeaders = [
    "item_code",
    "item_name",
    "description",
    "qty",
    "uom",
    "rate",
    "amount",
    "conversion_factor",
    "cost_center", // Placeholder for cost center
  ];

  const allHeaders = [...invoiceLevelHeaders, ...itemHeaders];
  let csvString = allHeaders.map(escapeCSVField).join(',') + '\n';

  invoices.forEach((invoice) => {
    const invoiceLevelDataEscaped = [
      escapeCSVField(invoice.lieferantName),
      escapeCSVField(invoice.rechnungsnummer),
      escapeCSVField(invoice.billDate),
      escapeCSVField(invoice.datum), // This is posting_date
      escapeCSVField(invoice.dueDate),
      escapeCSVField(invoice.wahrung || 'EUR'),
      escapeCSVField(""), // credit_to is blank
      escapeCSVField(invoice.istBezahlt?.toString() ?? '0'),
      escapeCSVField(invoice.remarks),
      escapeCSVField('1'), // update_stock (default)
      escapeCSVField('1'), // set_posting_time (default)
    ];

    if (invoice.rechnungspositionen && invoice.rechnungspositionen.length > 0) {
      invoice.rechnungspositionen.forEach((item, itemIndex) => {
        const itemCodeValue = item.productCode || item.productName || `FALLBACK_ITEM_${invoice.pdfFileName || 'INV'}_${itemIndex + 1}`;
        const itemNameValue = item.productName || item.productCode || `Item from ${invoice.pdfFileName || 'INV'}_${itemIndex + 1}`;
        const itemRate = item.unitPrice ?? 0;
        const itemQty = item.quantity ?? 0;
        const itemAmount = itemQty * itemRate;

        const itemDataEscaped = [
          escapeCSVField(itemCodeValue),                 // item_code
          escapeCSVField(itemNameValue),                 // item_name
          escapeCSVField(itemNameValue),                 // description (can be same as item_name)
          escapeCSVField(itemQty.toString()),            // qty
          escapeCSVField("Nos"),                         // uom (Unit of Measure - "Nos" for numbers/units)
          escapeCSVField(itemRate.toFixed(2)),           // rate
          escapeCSVField(itemAmount.toFixed(2)),         // amount
          escapeCSVField('1'),                           // conversion_factor (default 1)
          escapeCSVField(""),                            // cost_center (placeholder, to be filled by user if needed)
        ];
        csvString += [...invoiceLevelDataEscaped, ...itemDataEscaped].join(',') + '\n';
      });
    } else {
      // If an invoice has no items, create a default placeholder item row
      const placeholderItemCode = "DEFAULT_PLACEHOLDER_ITEM"; // User should ensure this item exists in ERPNext or is generic enough
      const placeholderItemName = `Placeholder Item (From Invoice ${invoice.rechnungsnummer || invoice.pdfFileName || 'Unknown'})`;
      const placeholderQty = 1;
      // If there's a total amount and no items, assume the total amount is for this single placeholder item.
      // If no total amount, rate and amount will be 0.
      const placeholderRate = invoice.gesamtbetrag !== undefined && invoice.gesamtbetrag !== null ? invoice.gesamtbetrag : 0;
      const placeholderAmount = placeholderRate * placeholderQty;

      const placeholderItemDataEscaped = [
        escapeCSVField(placeholderItemCode),                 // item_code
        escapeCSVField(placeholderItemName),                 // item_name
        escapeCSVField(placeholderItemName),                 // description
        escapeCSVField(placeholderQty.toString()),           // qty
        escapeCSVField("Nos"),                               // uom (Unit of Measure)
        escapeCSVField(placeholderRate.toFixed(2)),          // rate
        escapeCSVField(placeholderAmount.toFixed(2)),        // amount
        escapeCSVField('1'),                                 // conversion_factor
        escapeCSVField(""),                                  // cost_center (placeholder)
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

  erpInvoices.forEach((invoice) => {
    const invoiceLevelData = [
      invoice.lieferantName,
      invoice.rechnungsnummer,
      invoice.billDate,
      invoice.datum, // posting_date
      invoice.dueDate,
      invoice.wahrung || 'EUR',
      "", // credit_to
      invoice.istBezahlt?.toString() ?? '0',
      invoice.remarks,
      '1', // update_stock
      '1', // set_posting_time
    ];
    const invoiceLevelDataEscaped = invoiceLevelData.map(f => escapeTSVField(f));

    if (erpMode) {
        if (invoice.rechnungspositionen && invoice.rechnungspositionen.length > 0) {
            invoice.rechnungspositionen.forEach((item, itemIndex) => {
            const itemCodeValue = item.productCode || item.productName || `FALLBACK_ITEM_${invoice.pdfFileName || 'INV'}_${itemIndex + 1}`;
            const itemNameValue = item.productName || item.productCode || `Item for ${invoice.pdfFileName || 'INV'}_${itemIndex + 1}`;
            const itemRate = item.unitPrice ?? 0;
            const itemQty = item.quantity ?? 0;
            const itemAmount = itemQty * itemRate;

            const itemData = [
                itemCodeValue,
                itemNameValue,
                itemNameValue, // description
                itemQty.toString(),
                "Nos", // uom
                itemRate.toFixed(2),
                itemAmount.toFixed(2),
                '1', // conversion_factor
                "" // cost_center
            ];
            const itemDataEscaped = itemData.map(f => escapeTSVField(f));
            tsvString += [...invoiceLevelDataEscaped, ...itemDataEscaped].join('\t') + '\n';
            });
        } else {
            // Placeholder for item-less invoice in ERP mode
            const placeholderItemCode = "DEFAULT_PLACEHOLDER_ITEM";
            const placeholderItemName = `Placeholder Item (From Invoice ${invoice.rechnungsnummer || invoice.pdfFileName || 'Unknown'})`;
            const placeholderQty = 1;
            const placeholderRate = invoice.gesamtbetrag !== undefined && invoice.gesamtbetrag !== null ? invoice.gesamtbetrag : 0;
            const placeholderAmount = placeholderRate * placeholderQty;

            const placeholderItemDataEscaped = [
                escapeTSVField(placeholderItemCode),
                escapeTSVField(placeholderItemName),
                escapeTSVField(placeholderItemName),
                escapeTSVField(placeholderQty.toString()),
                escapeTSVField("Nos"),
                escapeTSVField(placeholderRate.toFixed(2)),
                escapeTSVField(placeholderAmount.toFixed(2)),
                escapeTSVField('1'),
                escapeTSVField(""),
            ];
            tsvString += [...invoiceLevelDataEscaped, ...placeholderItemDataEscaped].join('\t') + '\n';
        }
    } else {
        // Standard mode (non-ERP)
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

  // Reduced to essential and common fields for basic supplier import
  const supplierHeaders = [
    "ID", // Leave blank for new suppliers, ERPNext will assign
    "Supplier Name",
    "Supplier Type", // Default to "Company"
    "Supplier Group", // Default to "All Supplier Groups" or a valid one from user's ERPNext
    "Country", // Default to "Germany" or leave blank
    "Tax ID",
    "Address Line 1", // From invoice.lieferantAdresse
    "Email ID", // Usually not in invoice PDF, leave blank
    "Mobile No", // Usually not in invoice PDF, leave blank
    "Website", // Usually not in invoice PDF, leave blank
    "Supplier Details", // For any remarks or notes
  ];

  let csvString = supplierHeaders.map(escapeCSVField).join(',') + '\n';

  const uniqueSuppliers = new Map<string, ERPIncomingInvoiceItem>();
  invoices.forEach(invoice => {
    const supplierKey = (invoice.lieferantName || `UNKNOWN_SUPPLIER_${invoice.pdfFileName || 'PDF'}`).trim();
    if (supplierKey && !uniqueSuppliers.has(supplierKey) && supplierKey !== "UNBEKANNT_SUPPLIER_PLACEHOLDER") {
      uniqueSuppliers.set(supplierKey, invoice);
    }
  });

  uniqueSuppliers.forEach(invoice => {
    let taxId = "";
    if (invoice.remarks) {
        const taxIdMatch = invoice.remarks.match(/Tax ID:\s*([^\s\/,]+)/i) ||
                           invoice.remarks.match(/VAT ID:\s*([^\s\/,]+)/i) ||
                           invoice.remarks.match(/USt-IdNr.:\s*([^\s\/,]+)/i);
        if (taxIdMatch && taxIdMatch[1]) {
            taxId = taxIdMatch[1];
        }
    }

    const supplierDataRow = [
      "", // ID (blank for new)
      invoice.lieferantName,
      "Company", // Supplier Type (Fixed Value)
      "All Supplier", // Supplier Group (Corrected fixed value)
      "Germany", // Country (Fixed Value, or make configurable/extract if possible)
      taxId,
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
