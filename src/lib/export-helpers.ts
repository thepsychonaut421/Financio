
import type { IncomingInvoiceItem, ERPIncomingInvoiceItem } from '@/types/incoming-invoice';
import { format as formatDateFns, parseISO, isValid } from 'date-fns';

export function downloadFile(content: string, fileName: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
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

export function incomingInvoicesToERPNextCSV(invoices: ERPIncomingInvoiceItem[]): string {
  // This is the "Minimal" ERPNext CSV export for Purchase Invoice
  if (!invoices || invoices.length === 0) return '';

  // Standard headers for ERPNext Purchase Invoice minimal import
  const headers = [
    "supplier", 
    "bill_no",
    "posting_date", 
    "due_date", 
    "currency", 
    "item_code", // For the item
    "item_name", // For the item
    "qty",       // For the item
    "rate",      // For the item
    "is_paid" 
  ];
  
  let csvString = headers.map(escapeCSVField).join(',') + '\n';

  invoices.forEach((invoice) => {
    const mainInvoiceData = [
      escapeCSVField(invoice.lieferantName), 
      escapeCSVField(invoice.rechnungsnummer),
      escapeCSVField(invoice.datum), // Expected YYYY-MM-DD
      escapeCSVField(invoice.dueDate), // Expected YYYY-MM-DD
      escapeCSVField(invoice.wahrung || 'EUR'),
    ];

    if (invoice.rechnungspositionen && invoice.rechnungspositionen.length > 0) {
      invoice.rechnungspositionen.forEach(item => {
        const itemData = [
          escapeCSVField(item.productCode), // item_code
          escapeCSVField(item.productName), // item_name
          item.quantity.toString(),         // qty
          item.unitPrice.toString(),        // rate
        ];
        const row = [
            ...mainInvoiceData,
            ...itemData,
            invoice.istBezahlt?.toString() ?? '0' // is_paid (invoice level)
        ];
        csvString += row.map(escapeCSVField).join(',') + '\n';
      });
    } else {
       // Even if no items, ERPNext might need item columns for the format.
       // Add one row for the invoice with empty item details.
       const emptyItemData = ['', '', '', '']; 
       const row = [
           ...mainInvoiceData,
           ...emptyItemData,
           invoice.istBezahlt?.toString() ?? '0'
       ];
       csvString += row.map(escapeCSVField).join(',') + '\n';
    }
  });

  return csvString;
}


export function incomingInvoicesToERPNextCSVComplete(invoices: ERPIncomingInvoiceItem[]): string {
  if (!invoices || invoices.length === 0) return '';

  // Headers based on user feedback and common ERPNext Purchase Invoice import templates
  const headers = [
    // Invoice Level Headers
    "ID",                 // ERPNext internal ID (can be blank for new, or use reference if updating)
    "naming_series",      // Corrected to literal ACC-PINV-.YYYY.-
    "supplier",
    "posting_date",       // YYYY-MM-DD
    "bill_no",            // Supplier's invoice number
    "bill_date",          // YYYY-MM-DD
    "due_date",           // YYYY-MM-DD
    "currency",
    "credit_to",          // Made EMPTY as per user request
    "is_paid",            // 0 or 1
    "remarks",
    "update_stock",       // Default '1'
    "set_posting_time",   // Default '1'

    // Item Level Headers (prefixed for clarity, matching user's desired structure)
    "ID (Items)",                          // Maps to item.productCode
    "Item Name (Items)",                   // Maps to item.productName
    "Accepted Qty (Items)",                // Maps to item.quantity
    "Accepted Qty in Stock UOM (Items)",   // Same as Accepted Qty for now
    "Rate (Items)",                        // Maps to item.unitPrice
    "Amount (Items)",                      // Calculated: qty * rate
    "UOM (Items)",                         // Default "Stk"
    "UOM Conversion Factor (Items)",       // Default "1"
    "Amount (Company Currency) (Items)",   // Assuming invoice currency is company currency
    "Rate (Company Currency) (Items)",     // Assuming invoice currency is company currency
    // Potentially other item fields like 'warehouse', 'cost_center', 'description (Items)' if needed
  ];
  
  let csvString = headers.map(escapeCSVField).join(',') + '\n';

  invoices.forEach((invoice) => {
    const invoiceLevelData = [
      escapeCSVField(invoice.erpNextInvoiceName), // ID
      "ACC-PINV-.YYYY.-",                         // naming_series (literal string)
      escapeCSVField(invoice.lieferantName),
      escapeCSVField(invoice.datum),        
      escapeCSVField(invoice.rechnungsnummer),
      escapeCSVField(invoice.billDate),     
      escapeCSVField(invoice.dueDate),      
      escapeCSVField(invoice.wahrung || 'EUR'),
      "",                                         // credit_to (empty)
      invoice.istBezahlt?.toString() ?? '0',
      escapeCSVField(invoice.remarks),
      '1',                                        // update_stock
      '1',                                        // set_posting_time
    ];

    if (invoice.rechnungspositionen && invoice.rechnungspositionen.length > 0) {
      invoice.rechnungspositionen.forEach(item => {
        const itemAmount = (item.quantity || 0) * (item.unitPrice || 0);
        const itemData = [
          escapeCSVField(item.productCode),                 // ID (Items)
          escapeCSVField(item.productName),                 // Item Name (Items)
          item.quantity?.toString() ?? '0',                 // Accepted Qty (Items)
          item.quantity?.toString() ?? '0',                 // Accepted Qty in Stock UOM (Items)
          item.unitPrice?.toString() ?? '0.00',             // Rate (Items)
          itemAmount.toFixed(2),                            // Amount (Items)
          "Stk",                                            // UOM (Items)
          '1',                                              // UOM Conversion Factor (Items)
          itemAmount.toFixed(2),                            // Amount (Company Currency) (Items)
          item.unitPrice?.toString() ?? '0.00',             // Rate (Company Currency) (Items)
        ];
        csvString += [...invoiceLevelData, ...itemData].map(escapeCSVField).join(',') + '\n';
      });
    } else {
      // Add a line with empty item details if no items, to maintain CSV structure for the invoice
      const emptyItemData = Array(10).fill(''); // 10 item-specific columns
      csvString += [...invoiceLevelData, ...emptyItemData].map(escapeCSVField).join(',') + '\n';
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

export function incomingInvoicesToTSV(invoices: IncomingInvoiceItem[] | ERPIncomingInvoiceItem[], erpMode: boolean, useMinimalErpExport: boolean): string {
  if (!invoices || invoices.length === 0) return '';

  let tsvString = '';

  if (erpMode) {
    const erpInvoices = invoices as ERPIncomingInvoiceItem[];
    let headers: string[];
    
    if (useMinimalErpExport) {
      headers = ["supplier", "bill_no", "posting_date", "due_date", "currency", "item_code", "item_name", "qty", "rate", "is_paid"];
    } else { // "Complete" mode for TSV will follow the new detailed CSV structure
      headers = [
        "ID", "naming_series", "supplier", "posting_date", "bill_no", "bill_date", "due_date", "currency", 
        "credit_to", "is_paid", "remarks", "update_stock", "set_posting_time",
        "ID (Items)", "Item Name (Items)", "Accepted Qty (Items)", "Accepted Qty in Stock UOM (Items)",
        "Rate (Items)", "Amount (Items)", "UOM (Items)", "UOM Conversion Factor (Items)",
        "Amount (Company Currency) (Items)", "Rate (Company Currency) (Items)"
      ];
    }
    tsvString = headers.map(h => escapeTSVField(h)).join('\t') + '\n';

    erpInvoices.forEach((invoice) => {
      let mainInvoiceData: (string|number|undefined|null)[];
      if (useMinimalErpExport) {
        mainInvoiceData = [
            invoice.lieferantName,
            invoice.rechnungsnummer,
            invoice.datum, 
            invoice.dueDate,
            invoice.wahrung || 'EUR',
        ];
      } else { // Complete ERP Mode TSV
         mainInvoiceData = [
            invoice.erpNextInvoiceName, // ID
            "ACC-PINV-.YYYY.-",       // naming_series
            invoice.lieferantName,
            invoice.datum,            // posting_date
            invoice.rechnungsnummer,  // bill_no
            invoice.billDate,
            invoice.dueDate,
            invoice.wahrung || 'EUR',
            "",                       // credit_to
            invoice.istBezahlt?.toString() ?? '0',
            invoice.remarks,
            '1',                      // update_stock
            '1',                      // set_posting_time
         ];
      }
      const mainInvoiceDataEscaped = mainInvoiceData.map(f => escapeTSVField(f));

      if (invoice.rechnungspositionen && invoice.rechnungspositionen.length > 0) {
        invoice.rechnungspositionen.forEach(item => {
          let itemData: (string|number|undefined|null)[];
          const itemAmount = (item.quantity || 0) * (item.unitPrice || 0);
          if (useMinimalErpExport) {
            itemData = [
                item.productCode, // item_code
                item.productName, // item_name
                item.quantity.toString(),
                item.unitPrice.toString(),
            ];
          } else { // Complete ERP Mode Item Data for TSV
            itemData = [
                item.productCode,                 // ID (Items)
                item.productName,                 // Item Name (Items)
                item.quantity.toString(),         // Accepted Qty (Items)
                item.quantity.toString(),         // Accepted Qty in Stock UOM (Items)
                item.unitPrice.toString(),        // Rate (Items)
                itemAmount.toFixed(2),            // Amount (Items)
                "Stk",                            // UOM (Items)
                '1',                              // UOM Conversion Factor (Items)
                itemAmount.toFixed(2),            // Amount (Company Currency) (Items)
                item.unitPrice.toString(),        // Rate (Company Currency) (Items)
            ];
          }
          const itemDataEscaped = itemData.map(f => escapeTSVField(f));
          
          const rowParts = useMinimalErpExport 
            ? [...mainInvoiceDataEscaped, ...itemDataEscaped, escapeTSVField(invoice.istBezahlt?.toString() ?? '0')] 
            : [...mainInvoiceDataEscaped, ...itemDataEscaped];
          tsvString += rowParts.join('\t') + '\n';
        });
      } else {
        let emptyItemDataEscaped: string[];
        if (useMinimalErpExport) {
            emptyItemDataEscaped = Array(4).fill('').map(f => escapeTSVField(f)); // 4 item fields for minimal
            tsvString += mainInvoiceDataEscaped.join('\t') + '\t' + emptyItemDataEscaped.join('\t') + '\t' + escapeTSVField(invoice.istBezahlt?.toString() ?? '0') + '\n';
        } else { // Complete ERP Mode dummy item for TSV
             emptyItemDataEscaped = Array(10).fill('').map(f => escapeTSVField(f)); // 10 item fields for complete
            tsvString += mainInvoiceDataEscaped.join('\t') + '\t' + emptyItemDataEscaped.join('\t') + '\n';
        }
      }
    });

  } else { 
    // Standard (non-ERP) TSV export
    const regularInvoices = invoices as IncomingInvoiceItem[];
    const mainHeaders = [
      'PDF Datei', 'Rechnungsnummer', 'Datum', 'Lieferant Name', 'Lieferant Adresse',
      'Zahlungsziel', 'Zahlungsart', 'Gesamtbetrag', 'MwSt-Satz', 'Kunden-Nr.', 'Bestell-Nr.'
    ];
    const itemHeaders = ['Pos. Produkt Code', 'Pos. Produkt Name', 'Pos. Menge', 'Pos. Einzelpreis'];
    tsvString = mainHeaders.map(h => escapeTSVField(h)).join('\t') + '\t' + itemHeaders.map(h => escapeTSVField(h)).join('\t') + '\n';

    regularInvoices.forEach((invoice) => {
      const mainInvoiceData = [
        escapeTSVField(invoice.pdfFileName),
        escapeTSVField(invoice.rechnungsnummer),
        escapeTSVField(invoice.datum),
        escapeTSVField(invoice.lieferantName),
        escapeTSVField(invoice.lieferantAdresse),
        escapeTSVField(invoice.zahlungsziel),
        escapeTSVField(invoice.zahlungsart),
        invoice.gesamtbetrag?.toString() ?? '',
        escapeTSVField(invoice.mwstSatz),
        escapeCSVField(invoice.kundenNummer),
        escapeCSVField(invoice.bestellNummer),
      ];

      if (invoice.rechnungspositionen && invoice.rechnungspositionen.length > 0) {
        invoice.rechnungspositionen.forEach(item => {
          const itemData = [
            escapeTSVField(item.productCode),
            escapeTSVField(item.productName),
            item.quantity.toString(),
            item.unitPrice.toString(),
          ];
          tsvString += mainInvoiceData.join('\t') + '\t' + itemData.join('\t') + '\n';
        });
      } else {
        const emptyItemData = Array(itemHeaders.length).fill('');
        tsvString += mainInvoiceData.join('\t') + '\t' + emptyItemData.join('\t') + '\n';
      }
    });
  }
  return tsvString;
}

