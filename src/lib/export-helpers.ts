
import type { IncomingInvoiceItem, ERPIncomingInvoiceItem } from '@/types/incoming-invoice';

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
      // Ensure item headers are still present with empty values if no items
      const emptyItemData = Array(itemHeaders.length).fill('');
      csvString += mainInvoiceData.join(',') + ',' + emptyItemData.join(',') + '\n'; 
    }
  });

  return csvString;
}

// Minimal ERPNext CSV Export (Pflichtfelder)
export function incomingInvoicesToERPNextCSV(invoices: ERPIncomingInvoiceItem[]): string {
  if (!invoices || invoices.length === 0) return '';

  const headers = [
    "supplier", 
    "posting_date", 
    "bill_no", 
    "currency", 
    "grand_total", 
    // Item details
    "item_code",
    "item_name", // Changed from items/description
    "qty",
    "rate",
  ];
  
  let csvString = headers.join(',') + '\n';

  invoices.forEach((invoice) => {
    const mainInvoiceData = [
      escapeCSVField(invoice.lieferantName), 
      escapeCSVField(invoice.datum), 
      escapeCSVField(invoice.rechnungsnummer), 
      escapeCSVField(invoice.wahrung || 'EUR'),
      invoice.gesamtbetrag?.toString() ?? '',
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
       const emptyItemData = ['', '', '', '']; 
       csvString += mainInvoiceData.join(',') + ',' + emptyItemData.join(',') + '\n';
    }
  });

  return csvString;
}

// Helper to format date from YYYY-MM-DD to M/D/YY
function formatDateToMDYY(isoDateString?: string): string {
  if (!isoDateString || !/^\d{4}-\d{2}-\d{2}$/.test(isoDateString)) {
    return isoDateString || ''; // Return original or empty if not in YYYY-MM-DD or undefined
  }
  try {
    // Ensuring correct parsing, especially for Safari. Adding T00:00:00 makes it UTC but then convert to local parts.
    const dateParts = isoDateString.split('-');
    const year = parseInt(dateParts[0]);
    const month = parseInt(dateParts[1]); // 1-12
    const day = parseInt(dateParts[2]);   // 1-31

    // Get the last two digits of the year
    const shortYear = String(year).slice(-2);
    return `${month}/${day}/${shortYear}`;
  } catch (e) {
    return isoDateString; // Fallback
  }
}


// Updated "Complete" ERPNext CSV Export to match user-provided example structure
export function incomingInvoicesToERPNextCSVComplete(invoices: ERPIncomingInvoiceItem[]): string {
  if (!invoices || invoices.length === 0) return '';

  const headers = [
    "ID", // ERPNext Purchase Invoice ID
    "Series",
    "Supplier",
    "Date", // Invoice Date
    "Credit To", // Accounts Payable
    "ID (Items)", // Item identifier (using productCode)
    "Accepted Qty", // Item Quantity
    "Accepted Qn", // Item Quantity (repeated to match example)
    "Amount (Item)", // Line item total
    "Amount (Con Currency)", // Line item total (repeated)
    "Item Name (Items)",
    "Rate (Items)", // Unit Price
    "Rate (Compa Currency)", // Unit Price (repeated)
    "UOM (Items)",
    "UOM Conversion Factor"
  ];
  
  let csvString = headers.map(escapeCSVField).join(',') + '\n';

  invoices.forEach((invoice) => {
    if (invoice.rechnungspositionen && invoice.rechnungspositionen.length > 0) {
      invoice.rechnungspositionen.forEach(item => {
        const itemAmount = (item.quantity || 0) * (item.unitPrice || 0);
        const rowData = [
          escapeCSVField(invoice.erpNextInvoiceName),
          escapeCSVField("ACC-PINV-.Y"), // Matching example series
          escapeCSVField(invoice.lieferantName),
          escapeCSVField(formatDateToMDYY(invoice.datum)),
          escapeCSVField(invoice.kontenrahmen),
          escapeCSVField(item.productCode),
          item.quantity?.toString() ?? '0',
          item.quantity?.toString() ?? '0', // Repeated quantity
          itemAmount.toFixed(2),
          itemAmount.toFixed(2), // Repeated amount
          escapeCSVField(item.productName),
          item.unitPrice?.toString() ?? '0.00',
          item.unitPrice?.toString() ?? '0.00', // Repeated rate
          escapeCSVField("Stk"), // Default UOM
          '1' // Default UOM Conversion Factor
        ];
        csvString += rowData.join(',') + '\n';
      });
    }
    // If an invoice has no items, it won't be included in this item-centric export,
    // matching the likely behavior of an ERPNext line item export.
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
    
    // For TSV, we'll keep the original import-style formats as they are more structured
    // for data exchange rather than visual report matching.
    // The CSV "Complete" export is now specific to the visual example.
    if (useMinimalErpExport) {
      headers = ["supplier", "posting_date", "bill_no", "currency", "grand_total", "item_code", "item_name", "qty", "rate"];
    } else {
      // This is the "complete" ERPNext import style
      headers = [
        "supplier", "posting_date", "bill_no", "bill_date", "due_date", "currency", "grand_total", "is_paid", "debit_to", "remarks",
        "item_code", "item_name", "qty", "rate", "item_group", "warehouse", "cost_center"
      ];
    }
    tsvString = headers.join('\t') + '\n';

    erpInvoices.forEach((invoice) => {
      let mainInvoiceData: (string|number|undefined|null)[] = [];
      if (useMinimalErpExport) {
        mainInvoiceData = [
            invoice.lieferantName,
            invoice.datum, 
            invoice.rechnungsnummer,
            invoice.wahrung || 'EUR',
            invoice.gesamtbetrag?.toString() ?? '',
        ];
      } else {
         mainInvoiceData = [
            invoice.lieferantName,
            invoice.datum, 
            invoice.rechnungsnummer,
            invoice.billDate || invoice.datum,
            invoice.dueDate,
            invoice.wahrung || 'EUR',
            invoice.gesamtbetrag?.toString() ?? '',
            invoice.istBezahlt?.toString() ?? '0',
            invoice.kontenrahmen,
            invoice.remarks,
         ];
      }
      const mainInvoiceDataEscaped = mainInvoiceData.map(f => escapeTSVField(f));

      if (invoice.rechnungspositionen && invoice.rechnungspositionen.length > 0) {
        invoice.rechnungspositionen.forEach(item => {
          let itemData: (string|number|undefined|null)[] = [];
          if (useMinimalErpExport) {
            itemData = [
                item.productCode,
                item.productName,
                item.quantity.toString(),
                item.unitPrice.toString(),
            ];
          } else {
            itemData = [
                item.productCode,
                item.productName,
                item.quantity.toString(),
                item.unitPrice.toString(),
                '', // item_group
                '', // warehouse
                '', // cost_center
            ];
          }
          const itemDataEscaped = itemData.map(f => escapeTSVField(f));
          tsvString += mainInvoiceDataEscaped.join('\t') + '\t' + itemDataEscaped.join('\t') + '\n';
        });
      } else {
        const emptyItemCount = useMinimalErpExport ? 4 : (headers.length - mainInvoiceData.length);
        const emptyItemData = Array(emptyItemCount).fill('');
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
    tsvString = mainHeaders.join('\t') + '\t' + itemHeaders.join('\t') + '\n';

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

