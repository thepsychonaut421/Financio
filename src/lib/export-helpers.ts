
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

// Helper to format date to MM/DD/YY for specific ERPNext requirement if needed,
// but YYYY-MM-DD is generally preferred and used by formatDateForERP.
// This specific function is for the user's prompt request for MM/DD/YY in CSV.
function formatDateToMMDDYY(dateString?: string): string {
  if (!dateString) return '';
  try {
    const date = parseISO(dateString); // Expects YYYY-MM-DD input
    if (isValid(date)) {
      return formatDateFns(date, 'MM/dd/yy');
    }
  } catch (e) { /* ignore */ }
  return dateString; // Fallback
}


export function incomingInvoicesToCSV(invoices: IncomingInvoiceItem[]): string {
  if (!invoices || invoices.length === 0) return '';

  const mainHeaders = [
    'PDF Datei',
    'Rechnungsnummer',
    'Datum', // Original AI extracted date format
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
      escapeCSVField(invoice.datum), // YYYY-MM-DD
      escapeCSVField(invoice.dueDate), // YYYY-MM-DD
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
    "name", // ID (usually leave blank for new, ERPNext assigns)
    "series", // e.g., ACC-PINV-.YYYY.-
    "supplier",
    "bill_no",        
    "bill_date",       // YYYY-MM-DD
    "posting_date",    // YYYY-MM-DD
    "due_date",        // YYYY-MM-DD
    "currency",        
    "credit_to",       // Payable account
    "is_paid",         // 0 or 1
    "remarks",         
    "update_stock",    // 1 or 0
    "set_posting_time",// 1 or 0
    // Item Level
    "item_code",
    "item_name",
    "description",     
    "qty",
    "uom",             
    "rate",            
    "amount",          // qty * rate
    "conversion_factor", // For UOM conversion
    "warehouse",       // Optional
    "cost_center",     // Optional
    "expense_account"  // Optional
  ];
  
  let csvString = headers.map(escapeCSVField).join(',') + '\n';

  invoices.forEach((invoice) => {
    const postingDateYear = invoice.datum ? invoice.datum.substring(0, 4) : "YYYY";
    const seriesValue = `ACC-PINV-.${postingDateYear}.-`;

    const invoiceLevelData = [
      escapeCSVField(invoice.erpNextInvoiceName), // name/ID (could be blank for new)
      escapeCSVField(seriesValue),
      escapeCSVField(invoice.lieferantName),
      escapeCSVField(invoice.rechnungsnummer),
      escapeCSVField(invoice.billDate),    // YYYY-MM-DD
      escapeCSVField(invoice.datum),       // YYYY-MM-DD
      escapeCSVField(invoice.dueDate),     // YYYY-MM-DD
      escapeCSVField(invoice.wahrung || 'EUR'),
      escapeCSVField(invoice.kontenrahmen), 
      invoice.istBezahlt?.toString() ?? '0',
      escapeCSVField(invoice.remarks),
      '1', // update_stock
      '1', // set_posting_time
    ];

    if (invoice.rechnungspositionen && invoice.rechnungspositionen.length > 0) {
      invoice.rechnungspositionen.forEach(item => {
        const itemAmount = (item.quantity || 0) * (item.unitPrice || 0);
        const itemData = [
          escapeCSVField(item.productCode),
          escapeCSVField(item.productName),
          escapeCSVField(item.productName), 
          item.quantity?.toString() ?? '0',
          "Stk", // uom 
          item.unitPrice?.toString() ?? '0.00',
          itemAmount.toFixed(2), // amount
          '1', // conversion_factor
          "", // warehouse 
          "", // cost_center
          "", // expense_account
        ];
        csvString += [...invoiceLevelData, ...itemData].join(',') + '\n';
      });
    } else {
      // Create a row even for invoices without items, ERPNext might require at least one item line.
      // This "dummy" item line might need specific handling or a default item_code in ERPNext.
      const dummyItemData = [
        "DUMMY_ITEM", // item_code
        "N/A",        // item_name
        "N/A",        // description
        '0',          // qty
        "Stk",        // uom
        '0.00',       // rate
        '0.00',       // amount
        '1',          // conversion_factor
        "",           // warehouse
        "",           // cost_center
        "",           // expense_account
      ];
      csvString += [...invoiceLevelData, ...dummyItemData].join(',') + '\n';
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
    } else { // "Complete" mode for TSV will now follow the more detailed CSV structure
      headers = [
        "name", "series", "supplier", "bill_no", "bill_date", "posting_date", "due_date", "currency", 
        "credit_to", "is_paid", "remarks", "update_stock", "set_posting_time",
        "item_code", "item_name", "description", "qty", "uom", "rate", "amount", "conversion_factor",
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
      } else {
         mainInvoiceData = [
            invoice.erpNextInvoiceName, // name
            seriesValue, // series
            invoice.lieferantName,
            invoice.rechnungsnummer, 
            invoice.billDate, 
            invoice.datum, 
            invoice.dueDate,
            invoice.wahrung || 'EUR',
            invoice.kontenrahmen, 
            invoice.istBezahlt?.toString() ?? '0',
            invoice.remarks,
            '1', // update_stock
            '1', // set_posting_time
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
                invoice.istBezahlt?.toString() ?? '0' 
            ];
          } else {
            itemData = [
                item.productCode,
                item.productName,
                item.productName, 
                item.quantity.toString(),
                "Stk", // uom
                item.unitPrice.toString(),
                itemAmount.toFixed(2), // amount
                '1', // conversion_factor
                "", // warehouse
                "", // cost_center
                "", // expense_account
            ];
          }
          const itemDataEscaped = itemData.map(f => escapeTSVField(f));
          const rowParts = useMinimalErpExport 
            ? [...mainInvoiceDataEscaped, ...itemDataEscaped] 
            : [...mainInvoiceDataEscaped, ...itemDataEscaped];
          tsvString += rowParts.join('\t') + '\n';
        });
      } else {
        // For "complete" mode, add a dummy item line if no items exist
        let emptyItemData: string[];
        if (useMinimalErpExport) {
            emptyItemData = Array(5).fill('');
            emptyItemData[4] = invoice.istBezahlt?.toString() ?? '0'; // is_paid for minimal
        } else {
             emptyItemData = [
                "DUMMY_ITEM", "N/A", "N/A", '0', "Stk", '0.00', '0.00', '1', "", "", ""
            ].map(f => escapeTSVField(f));
        }
        tsvString += mainInvoiceDataEscaped.join('\t') + '\t' + emptyItemData.join('\t') + '\n';
      }
    });

  } else { 
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

