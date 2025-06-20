
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


export function incomingInvoicesToERPNextCSVComplete(invoices: ERPIncomingInvoiceItem[]): string {
  if (!invoices || invoices.length === 0) return '';

  // Invoice level headers for ERPNext Purchase Invoice import
  const invoiceHeaders = [
    "supplier", "bill_no", "bill_date", "posting_date", "due_date", 
    "currency", 
    "credit_to", // Left blank as requested
    "is_paid", "remarks", 
    "update_stock", "set_posting_time",
    // "naming_series" removed as requested
    // "ID" at invoice level removed as requested
  ];

  // Item level headers, aligned with ERPNext Purchase Invoice Item template
  const itemHeaders = [
    "ID (Items)", // Mapped from item.productCode
    "Item Name (Items)", // Mapped from item.productName
    "Description (Items)", // Can be same as Item Name
    "Accepted Qty (Items)", // Mapped from item.quantity
    "UOM (Items)", // Default "Stk"
    "Rate (Items)", // Mapped from item.unitPrice
    "Amount (Items)", // Calculated: qty * rate
    "Accepted Qty in Stock UOM (Items)", // Default to Accepted Qty
    "UOM Conversion Factor (Items)", // Default 1
    "Amount (Company Currency) (Items)", // Default to Amount (assuming invoice currency is company currency)
    "Rate (Company Currency) (Items)", // Default to Rate
    "Warehouse (Items)", // Placeholder - User to fill
    "Cost Center (Items)", // Placeholder - User to fill
    "Expense Account (Items)", // Placeholder - User to fill
  ];
  
  const allHeaders = [...invoiceHeaders, ...itemHeaders];
  let csvString = allHeaders.map(escapeCSVField).join(',') + '\n';

  invoices.forEach((invoice) => {
    const invoiceLevelData = [
      escapeCSVField(invoice.lieferantName),
      escapeCSVField(invoice.rechnungsnummer), 
      escapeCSVField(invoice.billDate),     
      escapeCSVField(invoice.datum), 
      escapeCSVField(invoice.dueDate),      
      escapeCSVField(invoice.wahrung || 'EUR'),
      "", // credit_to is blank
      invoice.istBezahlt?.toString() ?? '0',
      escapeCSVField(invoice.remarks),
      '1', // update_stock (default)
      '1', // set_posting_time (default)
    ];

    if (invoice.rechnungspositionen && invoice.rechnungspositionen.length > 0) {
      invoice.rechnungspositionen.forEach(item => {
        const itemAmount = (item.quantity || 0) * (item.unitPrice || 0);
        const itemData = [
          escapeCSVField(item.productCode),                 
          escapeCSVField(item.productName),                 
          escapeCSVField(item.productName),                 
          item.quantity?.toString() ?? '0',                 
          "Stk",                                            
          item.unitPrice?.toString() ?? '0.00',             
          itemAmount.toFixed(2),                            
          item.quantity?.toString() ?? '0',                 
          '1',                                              
          itemAmount.toFixed(2),                           
          item.unitPrice?.toString() ?? '0.00',            
          "", // Warehouse (Items) - User to fill
          "", // Cost Center (Items) - User to fill
          "", // Expense Account (Items) - User to fill
        ];
        csvString += [...invoiceLevelData, ...itemData].map(escapeCSVField).join(',') + '\n';
      });
    } else {
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

export function incomingInvoicesToTSV(invoices: IncomingInvoiceItem[] | ERPIncomingInvoiceItem[], erpMode: boolean): string {
  if (!invoices || invoices.length === 0) return '';
  let tsvString = '';

  // For TSV, if erpMode, we'll use the same "complete" structure as the CSV
  const erpInvoices = invoices as ERPIncomingInvoiceItem[];
   const invoiceHeaders = [
    "supplier", "bill_no", "bill_date", "posting_date", "due_date", 
    "currency", "credit_to", "is_paid", "remarks", 
    "update_stock", "set_posting_time"
  ];
  const itemHeaders = [
    "ID (Items)", "Item Name (Items)", "Description (Items)", "Accepted Qty (Items)", "UOM (Items)",
    "Rate (Items)", "Amount (Items)", "Accepted Qty in Stock UOM (Items)", "UOM Conversion Factor (Items)",
    "Amount (Company Currency) (Items)", "Rate (Company Currency) (Items)",
    "Warehouse (Items)", "Cost Center (Items)", "Expense Account (Items)"
  ];
  const headers = erpMode ? [...invoiceHeaders, ...itemHeaders] : [
    'PDF Datei', 'Rechnungsnummer', 'Datum', 'Lieferant Name', 'Lieferant Adresse',
    'Zahlungsziel', 'Zahlungsart', 'Gesamtbetrag', 'MwSt-Satz', 'Kunden-Nr.', 'Bestell-Nr.',
    'Pos. Produkt Code', 'Pos. Produkt Name', 'Pos. Menge', 'Pos. Einzelpreis'
  ];
  tsvString = headers.map(h => escapeTSVField(h)).join('\t') + '\n';

  erpInvoices.forEach((invoice) => {
    if (erpMode) {
        const mainInvoiceData = [
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
        const mainInvoiceDataEscaped = mainInvoiceData.map(f => escapeTSVField(f));

        if (invoice.rechnungspositionen && invoice.rechnungspositionen.length > 0) {
            invoice.rechnungspositionen.forEach(item => {
            const itemAmount = (item.quantity || 0) * (item.unitPrice || 0);
            const itemData = [
                item.productCode,                 
                item.productName,                 
                item.productName,                 
                item.quantity.toString(),         
                "Stk",                            
                item.unitPrice.toString(),        
                itemAmount.toFixed(2),           
                item.quantity.toString(),         
                '1',                             
                itemAmount.toFixed(2),            
                item.unitPrice.toString(),       
                "", // Warehouse (Items)
                "", // Cost Center (Items)
                "", // Expense Account (Items)
            ];
            const itemDataEscaped = itemData.map(f => escapeTSVField(f));
            tsvString += [...mainInvoiceDataEscaped, ...itemDataEscaped].join('\t') + '\n';
            });
        } else {
            const emptyItemDataEscaped = Array(itemHeaders.length).fill('').map(f => escapeTSVField(f));
            tsvString += mainInvoiceDataEscaped.join('\t') + '\t' + emptyItemDataEscaped.join('\t') + '\n';
        }
    } else { // Standard mode (non-ERP, original TSV logic)
        const regularInvoice = invoice as IncomingInvoiceItem; // Cast for standard fields
        const mainInvoiceDataStd = [
            escapeTSVField(regularInvoice.pdfFileName),
            escapeTSVField(regularInvoice.rechnungsnummer),
            escapeTSVField(regularInvoice.datum),
            escapeTSVField(regularInvoice.lieferantName),
            escapeTSVField(regularInvoice.lieferantAdresse),
            escapeTSVField(regularInvoice.zahlungsziel),
            escapeTSVField(regularInvoice.zahlungsart),
            regularInvoice.gesamtbetrag?.toString() ?? '',
            escapeTSVField(regularInvoice.mwstSatz),
            escapeTSVField(regularInvoice.kundenNummer),
            escapeTSVField(regularInvoice.bestellNummer),
        ];

        if (regularInvoice.rechnungspositionen && regularInvoice.rechnungspositionen.length > 0) {
            regularInvoice.rechnungspositionen.forEach(item => {
            const itemData = [
                escapeTSVField(item.productCode),
                escapeTSVField(item.productName),
                item.quantity.toString(),
                item.unitPrice.toString(),
            ];
            // For standard TSV, headers are different, ensure we combine correctly
            // Assuming the 'headers' array at the top correctly represents a flat structure for standard mode.
            tsvString += [...mainInvoiceDataStd, ...itemData].join('\t') + '\n';
            });
        } else {
            const emptyItemData = Array(4).fill(''); // 4 item-specific fields for standard
            tsvString += mainInvoiceDataStd.join('\t') + '\t' + emptyItemData.join('\t') + '\n';
        }
    }
  });
  return tsvString;
}

export function erpInvoicesToSupplierCSV(invoices: ERPIncomingInvoiceItem[]): string {
  if (!invoices || invoices.length === 0) return '';

  // Headers strictly matching the user's "perfect formula" image
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
    const supplierKey = (invoice.lieferantName || 'UNKNOWN_SUPPLIER').trim();
    if (supplierKey && !uniqueSuppliers.has(supplierKey)) {
      uniqueSuppliers.set(supplierKey, invoice);
    }
  });

  uniqueSuppliers.forEach(invoice => { 
    let taxId = "";
    if (invoice.remarks) {
        const taxIdMatch = invoice.remarks.match(/Tax ID:\s*([^\s\/]+)/i) || invoice.remarks.match(/VAT ID:\s*([^\s\/]+)/i) || invoice.remarks.match(/USt-IdNr.:\s*([^\s\/]+)/i);
        if (taxIdMatch && taxIdMatch[1]) {
            taxId = taxIdMatch[1];
        }
    }

    const supplierDataRow = [
      "", // ID (blank for new)
      escapeCSVField(invoice.lieferantName),
      "Company", // Supplier Type (Fixed Value as per image)
      escapeCSVField(taxId), 
      escapeCSVField(invoice.lieferantAdresse), 
      "", // Email Id (blank)
      "", // Mobile No (blank)
      "", // Website (blank)
    ];
    csvString += supplierDataRow.map(escapeCSVField).join(',') + '\n';
  });

  return csvString;
}
