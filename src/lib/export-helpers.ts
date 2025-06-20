
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
    const date = parseISO(dateString); 
    if (isValid(date)) {
      return formatDateFns(date, 'MM/dd/yy');
    }
  } catch (e) { /* ignore */ }
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
      const emptyItemData = Array(itemHeaders.length).fill('');
      csvString += mainInvoiceData.join(',') + ',' + emptyItemData.join(',') + '\n'; 
    }
  });

  return csvString;
}

export function incomingInvoicesToERPNextCSV(invoices: ERPIncomingInvoiceItem[]): string {
  // This is the "Minimal" ERPNext CSV export
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
      escapeCSVField(invoice.datum), // Expected YYYY-MM-DD
      escapeCSVField(invoice.dueDate), // Expected YYYY-MM-DD
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

  const headers = [
    // Invoice Level Headers (ERPNext Purchase Invoice Doctype)
    "name",                // Can be blank for new, ERPNext assigns ID. Using our generated one.
    "docstatus",           // 0 for Draft, 1 for Submitted
    "supplier",
    "bill_no",             // Supplier's invoice number
    "bill_date",           // Supplier's invoice date (YYYY-MM-DD)
    "posting_date",        // Date to post in GL (YYYY-MM-DD)
    "due_date",            // Payment due date (YYYY-MM-DD)
    "currency",            // e.g., EUR
    "credit_to",           // Accounts Payable account - MADE EMPTY as per user request "sari peste!"
    "is_paid",             // 0 or 1
    "remarks",
    "update_stock",        // Typically 1 for purchase invoices with items
    "set_posting_time",    // Typically 1
    "naming_series",       // Leave blank to use default, or provide "ACC-PINV-.YYYY.-" 
                           // Let's use 'series' as the column name, consistent with user's prompt
    // Item Level Headers (ERPNext Purchase Invoice Item Doctype)
    // These will be repeated for each item line, joined with invoice level data.
    "item_code",
    "item_name",
    "description",         // Often same as item_name
    "qty",
    "uom",                 // Unit of Measure, e.g., "Stk", "Kg"
    "rate",                // Price per unit
    "amount",              // qty * rate
    "base_rate",           // Rate in company base currency
    "base_amount",         // Amount in company base currency
    "conversion_factor",   // For UOM conversion (usually 1 if item UOM is base UOM)
    "warehouse",           // Optional: Target warehouse for stock items
    "cost_center",         // Optional
    "expense_account"      // Optional: Expense account for non-stock items
  ];
  
  let csvString = headers.map(escapeCSVField).join(',') + '\n';

  invoices.forEach((invoice) => {
    const postingDateYear = invoice.datum ? invoice.datum.substring(0, 4) : "YYYY";
    // Correct series format based on user feedback
    const seriesValue = `ACC-PINV-.${postingDateYear}.-`; 

    const invoiceLevelData = [
      escapeCSVField(invoice.erpNextInvoiceName), // name (our generated ID for reference)
      '0', // docstatus (Draft)
      escapeCSVField(invoice.lieferantName),
      escapeCSVField(invoice.rechnungsnummer),
      escapeCSVField(invoice.billDate),    
      escapeCSVField(invoice.datum),       
      escapeCSVField(invoice.dueDate),     
      escapeCSVField(invoice.wahrung || 'EUR'),
      "", // credit_to - SKIPPED as per user request ("sari peste!")
      invoice.istBezahlt?.toString() ?? '0',
      escapeCSVField(invoice.remarks),
      '1', // update_stock
      '1', // set_posting_time
      escapeCSVField(seriesValue), // naming_series (using 'series' as column name based on user prompt)
    ];

    if (invoice.rechnungspositionen && invoice.rechnungspositionen.length > 0) {
      invoice.rechnungspositionen.forEach(item => {
        const itemAmount = (item.quantity || 0) * (item.unitPrice || 0);
        const itemData = [
          escapeCSVField(item.productCode),
          escapeCSVField(item.productName),
          escapeCSVField(item.productName), 
          item.quantity?.toString() ?? '0',
          "Stk", // uom (default)
          item.unitPrice?.toString() ?? '0.00',
          itemAmount.toFixed(2), // amount
          item.unitPrice?.toString() ?? '0.00', // base_rate (assuming invoice currency is base currency)
          itemAmount.toFixed(2), // base_amount (assuming invoice currency is base currency)
          '1', // conversion_factor (default)
          "", // warehouse 
          "", // cost_center
          "", // expense_account
        ];
        csvString += [...invoiceLevelData, ...itemData].map(escapeCSVField).join(',') + '\n';
      });
    } else {
      // Add a line even for invoices without items, but item fields will be blank or default.
      // ERPNext might require at least one item line, so this prevents skipping the invoice.
      const dummyItemData = [
        "", // item_code
        "N/A (No items extracted)", // item_name
        "N/A (No items extracted)", // description
        '0',          // qty
        "Stk",        // uom
        '0.00',       // rate
        '0.00',       // amount
        '0.00',       // base_rate
        '0.00',       // base_amount
        '1',          // conversion_factor
        "",           // warehouse
        "",           // cost_center
        "",           // expense_account
      ];
      csvString += [...invoiceLevelData, ...dummyItemData].map(escapeCSVField).join(',') + '\n';
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
        "name", "docstatus", "supplier", "bill_no", "bill_date", "posting_date", "due_date", "currency", 
        "credit_to", "is_paid", "remarks", "update_stock", "set_posting_time", "naming_series",
        "item_code", "item_name", "description", "qty", "uom", "rate", "amount", 
        "base_rate", "base_amount", "conversion_factor",
        "warehouse", "cost_center", "expense_account"
      ];
    }
    tsvString = headers.map(h => escapeTSVField(h)).join('\t') + '\n';

    erpInvoices.forEach((invoice) => {
      const postingDateYear = invoice.datum ? invoice.datum.substring(0, 4) : "YYYY";
      const seriesValue = `ACC-PINV-.${postingDateYear}.-`;
      
      let mainInvoiceData: (string|number|undefined|null)[];
      if (useMinimalErpExport) {
        mainInvoiceData = [
            invoice.lieferantName,
            invoice.rechnungsnummer,
            invoice.datum, 
            invoice.dueDate,
            invoice.wahrung || 'EUR',
        ];
      } else { // Complete ERP Mode
         mainInvoiceData = [
            invoice.erpNextInvoiceName,
            '0', // docstatus
            invoice.lieferantName,
            invoice.rechnungsnummer, 
            invoice.billDate, 
            invoice.datum, 
            invoice.dueDate,
            invoice.wahrung || 'EUR',
            "", // credit_to - empty
            invoice.istBezahlt?.toString() ?? '0',
            invoice.remarks,
            '1', // update_stock
            '1', // set_posting_time
            seriesValue, // naming_series
         ];
      }
      const mainInvoiceDataEscaped = mainInvoiceData.map(f => escapeTSVField(f));

      if (invoice.rechnungspositionen && invoice.rechnungspositionen.length > 0) {
        invoice.rechnungspositionen.forEach(item => {
          let itemData: (string|number|undefined|null)[];
          const itemAmount = (item.quantity || 0) * (item.unitPrice || 0);
          if (useMinimalErpExport) {
            // is_paid is part of main invoice data for minimal, not per item
            itemData = [
                item.productCode,
                item.productName,
                item.quantity.toString(),
                item.unitPrice.toString(),
            ];
          } else { // Complete ERP Mode Item Data
            itemData = [
                item.productCode,
                item.productName,
                item.productName, 
                item.quantity.toString(),
                "Stk", // uom
                item.unitPrice.toString(),
                itemAmount.toFixed(2), // amount
                item.unitPrice.toString(), // base_rate
                itemAmount.toFixed(2), // base_amount
                '1', // conversion_factor
                "", // warehouse
                "", // cost_center
                "", // expense_account
            ];
          }
          const itemDataEscaped = itemData.map(f => escapeTSVField(f));
          
          // For minimal export, is_paid is added after item data
          const rowParts = useMinimalErpExport 
            ? [...mainInvoiceDataEscaped, ...itemDataEscaped, escapeTSVField(invoice.istBezahlt?.toString() ?? '0')] 
            : [...mainInvoiceDataEscaped, ...itemDataEscaped];
          tsvString += rowParts.join('\t') + '\n';
        });
      } else {
        // For "complete" mode, add a dummy item line if no items exist
        let emptyItemData: string[];
        if (useMinimalErpExport) {
            emptyItemData = Array(4).fill(''); // 4 item fields for minimal
            tsvString += mainInvoiceDataEscaped.join('\t') + '\t' + emptyItemData.join('\t') + '\t' + escapeTSVField(invoice.istBezahlt?.toString() ?? '0') + '\n';
        } else { // Complete ERP Mode dummy item
             emptyItemData = [
                "", "N/A (No items extracted)", "N/A (No items extracted)", '0', "Stk", 
                '0.00', '0.00', '0.00', '0.00', '1', "", "", ""
            ].map(f => escapeTSVField(f));
            tsvString += mainInvoiceDataEscaped.join('\t') + '\t' + emptyItemData.join('\t') + '\n';
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
        escapeTSVField(invoice.kundenNummer),
        escapeTSVField(invoice.bestellNummer),
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

