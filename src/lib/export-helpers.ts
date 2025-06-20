
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
  // Removed "ID" (for invoice) and "naming_series"
  const invoiceHeaders = [
    "supplier", "bill_no", "bill_date", "posting_date", "due_date", 
    "currency", 
    "credit_to", 
    "is_paid", "remarks", 
    "update_stock", "set_posting_time",
  ];

  // Item level headers, aligned with ERPNext Purchase Invoice Item template
  const itemHeaders = [
    "ID (Items)", // Mapped from item.productCode (if items are pre-existing, else leave blank for new items)
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
    "Warehouse (Items)", // Placeholder - User to fill or map
    "Cost Center (Items)", // Placeholder - User to fill or map
    "Expense Account (Items)", // Placeholder - User to fill or map
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
      "", // credit_to is left blank as per request
      invoice.istBezahlt?.toString() ?? '0',
      escapeCSVField(invoice.remarks),
      '1', // update_stock (default)
      '1', // set_posting_time (default)
    ];

    if (invoice.rechnungspositionen && invoice.rechnungspositionen.length > 0) {
      invoice.rechnungspositionen.forEach(item => {
        const itemAmount = (item.quantity || 0) * (item.unitPrice || 0);
        const itemData = [
          escapeCSVField(item.productCode), // For "ID (Items)", using productCode. If item is new, ERPNext might auto-create or require it blank.
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
      // If no items, typically the row might be for a GL entry only invoice, or it might be an error.
      // For now, including with empty item data to represent the invoice header.
      // ERPNext might require at least one item or a specific setup for item-less invoices.
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

  const erpInvoices = invoices as ERPIncomingInvoiceItem[];
   const invoiceHeaders = [ // Matched to ERPNext CSV complete, without ID/naming_series
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
  const standardModeHeaders = [
    'PDF Datei', 'Rechnungsnummer', 'Datum', 'Lieferant Name', 'Lieferant Adresse',
    'Zahlungsziel', 'Zahlungsart', 'Gesamtbetrag', 'MwSt-Satz', 'Kunden-Nr.', 'Bestell-Nr.',
    'Pos. Produkt Code', 'Pos. Produkt Name', 'Pos. Menge', 'Pos. Einzelpreis'
  ];

  const headers = erpMode ? [...invoiceHeaders, ...itemHeaders] : standardModeHeaders;
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
            tsvString += [...mainInvoiceDataEscaped, ...emptyItemDataEscaped].join('\t') + '\n';
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

  const supplierHeaders = [
    "ID", // Leave blank for new suppliers, ERPNext will assign
    "Supplier Name",
    "Supplier Type",
    "Supplier Group",
    "Country",
    "Tax ID",
    "Address Line 1",
    "Email ID",
    "Mobile No",
    "Website",
    "Supplier Details" // General notes field
  ];

  let csvString = supplierHeaders.map(escapeCSVField).join(',') + '\n';

  const uniqueSuppliers = new Map<string, ERPIncomingInvoiceItem>();
  invoices.forEach(invoice => {
    const supplierKey = (invoice.lieferantName || 'UNKNOWN_SUPPLIER').trim();
    // Ensure only one entry per supplier name, taking the first encountered
    if (supplierKey && !uniqueSuppliers.has(supplierKey)) {
      uniqueSuppliers.set(supplierKey, invoice);
    }
  });

  uniqueSuppliers.forEach(invoice => { 
    let taxId = "";
    // Attempt to extract Tax ID from remarks
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
      "All Supplier", // Supplier Group (Corrected Fixed Value)
      "Germany", // Country (Fixed Value, adjust if needed)
      taxId, 
      invoice.lieferantAdresse, // Maps to Address Line 1
      "", // Email Id (blank, not extracted from invoice PDF)
      "", // Mobile No (blank, not extracted from invoice PDF)
      "", // Website (blank, not extracted from invoice PDF)
      "", // Supplier Details (blank, can be filled manually)
    ];
    csvString += supplierDataRow.map(escapeCSVField).join(',') + '\n';
  });

  return csvString;
}
