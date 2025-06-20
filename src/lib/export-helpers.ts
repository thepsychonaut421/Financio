
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

  const headers = [
    "supplier", 
    "bill_no",
    "posting_date", 
    "due_date", 
    "currency", 
    "item_code", 
    "item_name", 
    "qty",       
    "rate",      
    "is_paid" 
  ];
  
  let csvString = headers.map(escapeCSVField).join(',') + '\n';

  invoices.forEach((invoice) => {
    const mainInvoiceData = [
      escapeCSVField(invoice.lieferantName), 
      escapeCSVField(invoice.rechnungsnummer),
      escapeCSVField(invoice.datum), 
      escapeCSVField(invoice.dueDate), 
      escapeCSVField(invoice.wahrung || 'EUR'),
    ];

    if (invoice.rechnungspositionen && invoice.rechnungspositionen.length > 0) {
      invoice.rechnungspositionen.forEach(item => {
        const itemData = [
          escapeCSVField(item.productCode), 
          escapeCSVField(item.productName), 
          item.quantity.toString(),         
          item.unitPrice.toString(),        
        ];
        const row = [
            ...mainInvoiceData,
            ...itemData,
            invoice.istBezahlt?.toString() ?? '0' 
        ];
        csvString += row.map(escapeCSVField).join(',') + '\n';
      });
    } else {
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

  // Headers for ERPNext Purchase Invoice import (main document part)
  // Excluding ID and naming_series as requested
  const invoiceHeaders = [
    "supplier",
    "posting_date",       // YYYY-MM-DD
    "bill_no",            // Supplier's invoice number
    "bill_date",          // YYYY-MM-DD
    "due_date",           // YYYY-MM-DD
    "currency",
    "credit_to",          // Account - kept blank as requested
    "is_paid",            // 0 or 1
    "remarks",
    "update_stock",       // Default '1'
    "set_posting_time",   // Default '1'
    // Potentially other main invoice fields if needed: "terms", "taxes_and_charges" (requires template ID)
  ];

  // Headers for ERPNext Purchase Invoice Item import part
  const itemHeaders = [
    "ID (Items)",                          // Maps to item.productCode
    "Item Name (Items)",                   // Maps to item.productName
    "Description (Items)",                 // Can be same as Item Name or more detailed
    "Accepted Qty (Items)",                // Maps to item.quantity
    "UOM (Items)",                         // Default "Stk"
    "Rate (Items)",                        // Maps to item.unitPrice
    "Amount (Items)",                      // Calculated: qty * rate
    "UOM Conversion Factor (Items)",       // Default "1"
    "Accepted Qty in Stock UOM (Items)",   // Often same as Accepted Qty
    "Amount (Company Currency) (Items)",   // Assuming invoice currency is company currency
    "Rate (Company Currency) (Items)",     // Assuming invoice currency is company currency
    "Warehouse (Items)",                   // Placeholder, user to fill if needed
    "Cost Center (Items)",                 // Placeholder, user to fill if needed
    "Expense Account (Items)",             // Placeholder, user to fill if needed
  ];
  
  const allHeaders = [...invoiceHeaders, ...itemHeaders];
  let csvString = allHeaders.map(escapeCSVField).join(',') + '\n';

  invoices.forEach((invoice) => {
    const invoiceLevelData = [
      escapeCSVField(invoice.lieferantName),
      escapeCSVField(invoice.datum),        
      escapeCSVField(invoice.rechnungsnummer),
      escapeCSVField(invoice.billDate),     
      escapeCSVField(invoice.dueDate),      
      escapeCSVField(invoice.wahrung || 'EUR'),
      "",                                         // credit_to (blank)
      invoice.istBezahlt?.toString() ?? '0',
      escapeCSVField(invoice.remarks),
      '1',                                        // update_stock (default)
      '1',                                        // set_posting_time (default)
    ];

    if (invoice.rechnungspositionen && invoice.rechnungspositionen.length > 0) {
      invoice.rechnungspositionen.forEach(item => {
        const itemAmount = (item.quantity || 0) * (item.unitPrice || 0);
        const itemData = [
          escapeCSVField(item.productCode),                 // ID (Items)
          escapeCSVField(item.productName),                 // Item Name (Items)
          escapeCSVField(item.productName),                 // Description (Items) - using product name as default
          item.quantity?.toString() ?? '0',                 // Accepted Qty (Items)
          "Stk",                                            // UOM (Items) - default
          item.unitPrice?.toString() ?? '0.00',             // Rate (Items)
          itemAmount.toFixed(2),                            // Amount (Items)
          '1',                                              // UOM Conversion Factor (Items) - default
          item.quantity?.toString() ?? '0',                 // Accepted Qty in Stock UOM (Items) - default
          itemAmount.toFixed(2),                            // Amount (Company Currency) (Items) - default
          item.unitPrice?.toString() ?? '0.00',             // Rate (Company Currency) (Items) - default
          "",                                               // Warehouse (Items) - blank placeholder
          "",                                               // Cost Center (Items) - blank placeholder
          "",                                               // Expense Account (Items) - blank placeholder
        ];
        csvString += [...invoiceLevelData, ...itemData].map(escapeCSVField).join(',') + '\n';
      });
    } else {
      // Add a line with empty item details if no items, to represent the invoice itself
      const emptyItemData = Array(itemHeaders.length).fill(''); 
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
    } else { // "Complete" mode for TSV will follow the new detailed CSV structure (without ID and naming_series for invoice)
      headers = [
        "supplier", "posting_date", "bill_no", "bill_date", "due_date", "currency", 
        "credit_to", "is_paid", "remarks", "update_stock", "set_posting_time",
        "ID (Items)", "Item Name (Items)", "Description (Items)", "Accepted Qty (Items)", "UOM (Items)",
        "Rate (Items)", "Amount (Items)", "UOM Conversion Factor (Items)",
        "Accepted Qty in Stock UOM (Items)", "Amount (Company Currency) (Items)", "Rate (Company Currency) (Items)",
        "Warehouse (Items)", "Cost Center (Items)", "Expense Account (Items)"
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
      } else { // Complete ERP Mode TSV (invoice part)
         mainInvoiceData = [
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
                item.productCode, 
                item.productName, 
                item.quantity.toString(),
                item.unitPrice.toString(),
            ];
          } else { // Complete ERP Mode Item Data for TSV
            itemData = [
                item.productCode,                 // ID (Items)
                item.productName,                 // Item Name (Items)
                item.productName,                 // Description (Items)
                item.quantity.toString(),         // Accepted Qty (Items)
                "Stk",                            // UOM (Items)
                item.unitPrice.toString(),        // Rate (Items)
                itemAmount.toFixed(2),            // Amount (Items)
                '1',                              // UOM Conversion Factor (Items)
                item.quantity.toString(),         // Accepted Qty in Stock UOM (Items)
                itemAmount.toFixed(2),            // Amount (Company Currency) (Items)
                item.unitPrice.toString(),        // Rate (Company Currency) (Items)
                "",                               // Warehouse (Items)
                "",                               // Cost Center (Items)
                "",                               // Expense Account (Items)
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
            emptyItemDataEscaped = Array(4).fill('').map(f => escapeTSVField(f)); 
            tsvString += mainInvoiceDataEscaped.join('\t') + '\t' + emptyItemDataEscaped.join('\t') + '\t' + escapeTSVField(invoice.istBezahlt?.toString() ?? '0') + '\n';
        } else { 
             emptyItemDataEscaped = Array(itemHeaders.length - invoiceHeaders.length).fill('').map(f => escapeTSVField(f));
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

