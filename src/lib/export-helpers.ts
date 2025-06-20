
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

  // Parent document headers (Purchase Invoice)
  const invoiceHeaders = [
    "supplier", "bill_no", "bill_date", "posting_date", "due_date", 
    "currency", 
    "credit_to", // Kept blank as requested by user
    "is_paid", "remarks", 
    "update_stock", "set_posting_time",
    // "naming_series" and "ID" removed as per user feedback for ERPNext to auto-assign
  ];

  // Child table headers (Purchase Invoice Item)
  // Aligned with common ERPNext import templates for Purchase Invoice Items
  const itemHeaders = [
    "item_code", // Changed from "ID (Items)"
    "item_name", 
    "description", 
    "qty", // Was "Accepted Qty (Items)"
    "uom", // Was "UOM (Items)"
    "rate", // Was "Rate (Items)"
    "amount", // Was "Amount (Items)"
    "conversion_factor", // Was "UOM Conversion Factor (Items)"
    // The following are often derived or set based on company/item defaults in ERPNext
    // For simplicity and to match common templates, only essential item fields are primary.
    // "stock_qty", // Was "Accepted Qty in Stock UOM (Items)" - often same as qty
    // "amount_in_company_currency", // Was "Amount (Company Currency) (Items)"
    // "rate_in_company_currency", // Was "Rate (Company Currency) (Items)"
    "cost_center", // Was "Cost Center (Items)" - kept as placeholder
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
      invoice.rechnungspositionen.forEach((item, itemIndex) => {
        const itemCodeValue = item.productCode || item.productName || `FALLBACK_ITEM_${invoice.pdfFileName || 'INV'}_${itemIndex + 1}`;
        const itemNameValue = item.productName || item.productCode || `Item for ${invoice.pdfFileName || 'INV'}_${itemIndex + 1}`;
        const itemRate = item.unitPrice ?? 0;
        const itemQty = item.quantity ?? 0;
        const itemAmount = itemQty * itemRate;
        
        const itemData = [
          escapeCSVField(itemCodeValue), 
          escapeCSVField(itemNameValue),                 
          escapeCSVField(itemNameValue), // Using item name as description          
          itemQty.toString(),                 
          "Stk", // Default UOM                                           
          itemRate.toString(),             
          itemAmount.toFixed(2),                            
          '1', // Default UOM Conversion Factor                                             
          // itemQty.toString(), // stock_qty
          // itemAmount.toFixed(2), // amount_in_company_currency                          
          // itemRate.toString(), // rate_in_company_currency           
          "", // Cost Center (Items) - User to fill
        ];
        csvString += [...invoiceLevelData, ...itemData].map(escapeCSVField).join(',') + '\n';
      });
    } else {
      // If an invoice has no items, ERPNext might not allow importing it this way,
      // or it might create an invoice with no items if the parent fields are sufficient.
      // For now, we'll create a row with parent data and empty item data.
      // This behavior might need adjustment based on specific ERPNext requirements for item-less PIs.
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
  const invoiceHeaders = [ 
    "supplier", "bill_no", "bill_date", "posting_date", "due_date", 
    "currency", "credit_to", "is_paid", "remarks", 
    "update_stock", "set_posting_time"
    // "naming_series" and "ID" removed
  ];

  const itemHeaders = [
    "item_code", "item_name", "description", "qty", "uom",
    "rate", "amount", "conversion_factor",
    // "stock_qty", "amount_in_company_currency", "rate_in_company_currency",
    "cost_center" 
  ];
  const standardModeHeaders = [
    'PDF Datei', 'Rechnungsnummer', 'Datum', 'Lieferant Name', 'Lieferant Adresse',
    'Zahlungsziel', 'Zahlungsart', 'Gesamtbetrag', 'MwSt-Satz', 'Kunden-Nr.', 'Bestell-Nr.',
    'Pos. Produkt Code', 'Pos. Produkt Name', 'Pos. Menge', 'Pos. Einzelpreis'
  ];

  const headers = erpMode ? [...invoiceHeaders, ...itemHeaders] : standardModeHeaders;
  tsvString = headers.map(h => escapeTSVField(h)).join('\t') + '\n';

  erpInvoices.forEach((invoice, invIndex) => {
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
            invoice.rechnungspositionen.forEach((item, itemIndex) => {
            const itemCodeValue = item.productCode || item.productName || `FALLBACK_ITEM_${invoice.pdfFileName || 'INV'}_${itemIndex + 1}`;
            const itemNameValue = item.productName || item.productCode || `Item for ${invoice.pdfFileName || 'INV'}_${itemIndex + 1}`;
            const itemRate = item.unitPrice ?? 0;
            const itemQty = item.quantity ?? 0;
            const itemAmount = itemQty * itemRate;

            const itemData = [
                itemCodeValue,                 
                itemNameValue,                 
                itemNameValue,                 
                itemQty.toString(),         
                "Stk",                            
                itemRate.toString(),        
                itemAmount.toFixed(2),           
                '1',                             
                // itemQty.toString(),            
                // itemAmount.toFixed(2),            
                // itemRate.toString(),       
                "" // Cost Center (Items)
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
    "Tax ID",
    "Primary Address",
    "Email Id", 
    "Mobile No", 
    "Website", 
  ];

  let csvString = supplierHeaders.map(escapeCSVField).join(',') + '\n';

  const uniqueSuppliers = new Map<string, ERPIncomingInvoiceItem>();
  invoices.forEach(invoice => {
    const supplierKey = (invoice.lieferantName || `UNKNOWN_SUPPLIER_FROM_${invoice.pdfFileName || 'PDF'}`).trim();
    if (supplierKey && !uniqueSuppliers.has(supplierKey)) {
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
      taxId, 
      invoice.lieferantAdresse, 
      "", // Email Id 
      "", // Mobile No 
      "", // Website
    ];
    csvString += supplierDataRow.map(escapeCSVField).join(',') + '\n';
  });

  return csvString;
}

    