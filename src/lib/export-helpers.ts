
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
  if (stringField.includes('"') || stringField.includes(',') || stringField.includes('\n')) {
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
      // Still add main invoice data even if there are no items, with empty item fields
      csvString += mainInvoiceData.join(',') + ',,,,\n'; 
    }
  });

  return csvString;
}

// ERPNext Data Import expects specific field names.
// These are common field names for Purchase Invoice and Purchase Invoice Item.
// Child table fields are prefixed with "items/" (or the child table's fieldname in parent doctype).
export function incomingInvoicesToERPNextCSV(invoices: ERPIncomingInvoiceItem[]): string {
  if (!invoices || invoices.length === 0) return '';

  const headers = [
    "supplier",                   // Supplier Name (Link to Supplier Doctype)
    "posting_date",               // Date (YYYY-MM-DD)
    "bill_no",                    // Supplier's Invoice Number
    "payment_terms_template",     // Payment Terms (Link to Payment Term Template)
    "currency",                   // Currency (e.g., EUR)
    "grand_total",                // Grand Total amount of the invoice
    // Item details - child table fields for 'items'
    "items/item_code",            // Link to Item Doctype
    "items/description",          // Item Description (can be product name)
    "items/qty",                  // Quantity
    "items/rate",                 // Rate per unit
  ];
  
  let csvString = headers.join(',') + '\n';

  invoices.forEach((invoice) => {
    // Format posting_date to YYYY-MM-DD
    let postingDate = invoice.datum || '';
    if (invoice.datum) {
        const datePartsDDMMYYYY = invoice.datum.match(/^(\d{2})\.(\d{2})\.(\d{4})$/); // DD.MM.YYYY
        const datePartsYYYYMMDD = invoice.datum.match(/^(\d{4})-(\d{2})-(\d{2})$/); // YYYY-MM-DD
        
        if (datePartsDDMMYYYY && datePartsDDMMYYYY[3] && datePartsDDMMYYYY[2] && datePartsDDMMYYYY[1]) {
            postingDate = `${datePartsDDMMYYYY[3]}-${datePartsDDMMYYYY[2]}-${datePartsDDMMYYYY[1]}`; // Convert DD.MM.YYYY to YYYY-MM-DD
        } else if (datePartsYYYYMMDD) {
            postingDate = invoice.datum; // Already in YYYY-MM-DD
        } else {
            // Attempt to parse other common date formats or log a warning
            // For simplicity, if not in expected formats, use as is or leave empty if critical
            // For robustness, one might try new Date(invoice.datum).toISOString().split('T')[0]
            // but this can be unreliable without knowing the exact input format.
            // For now, if not DD.MM.YYYY or YYYY-MM-DD, it might cause issues in ERPNext.
            // Defaulting to original if not matched, ERPNext might reject it.
            const d = new Date(invoice.datum);
            if (!isNaN(d.getTime())) {
                 postingDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            } else {
                postingDate = invoice.datum; // Fallback to original
            }
        }
    }


    const mainInvoiceData = [
      escapeCSVField(invoice.lieferantName), // Mapped supplier name
      escapeCSVField(postingDate),
      escapeCSVField(invoice.rechnungsnummer), // Original invoice number
      escapeCSVField(invoice.zahlungsziel),
      escapeCSVField(invoice.wahrung || 'EUR'),
      invoice.gesamtbetrag?.toString() ?? '',
    ];

    if (invoice.rechnungspositionen && invoice.rechnungspositionen.length > 0) {
      invoice.rechnungspositionen.forEach(item => {
        const itemData = [
          escapeCSVField(item.productCode),
          escapeCSVField(item.productName), // Using productName as description
          item.quantity.toString(),
          item.unitPrice.toString(),
        ];
        // Each row in CSV for ERPNext import typically represents one item line,
        // repeating parent DocType fields.
        csvString += mainInvoiceData.join(',') + ',' + itemData.join(',') + '\n';
      });
    } else {
      // If an invoice has no items, ERPNext might still require an "empty" item row
      // or it might not be importable. For now, we'll skip invoices without items
      // in the ERPNext CSV or add main data with empty item fields.
      // Let's add main data with empty item fields to represent the invoice.
       const emptyItemData = ['', '', '', ''];
       csvString += mainInvoiceData.join(',') + ',' + emptyItemData.join(',') + '\n';
    }
  });

  return csvString;
}


export function incomingInvoicesToJSON(invoices: IncomingInvoiceItem[] | ERPIncomingInvoiceItem[]): string {
  return JSON.stringify(invoices, null, 2);
}

function escapeTSVField(field: string | number | undefined | null): string {
  if (field === undefined || field === null) return '';
  return String(field).replace(/\t/g, ' ').replace(/\n/g, ' ');
}

export function incomingInvoicesToTSV(invoices: IncomingInvoiceItem[] | ERPIncomingInvoiceItem[], erpMode: boolean): string {
  if (!invoices || invoices.length === 0) return '';

  let tsvString = '';

  if (erpMode) {
    const erpInvoices = invoices as ERPIncomingInvoiceItem[];
    // Align TSV headers with the simplified ERPNext CSV headers
    const headers = [
      "supplier", "posting_date", "bill_no", "payment_terms_template", 
      "currency", "grand_total", 
      "items/item_code", "items/description", "items/qty", "items/rate"
    ];
    tsvString = headers.join('\t') + '\n';

    erpInvoices.forEach((invoice) => {
      let postingDate = invoice.datum || '';
      if (invoice.datum) {
          const datePartsDDMMYYYY = invoice.datum.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
          const datePartsYYYYMMDD = invoice.datum.match(/^(\d{4})-(\d{2})-(\d{2})$/);
          if (datePartsDDMMYYYY && datePartsDDMMYYYY[3] && datePartsDDMMYYYY[2] && datePartsDDMMYYYY[1]) {
              postingDate = `${datePartsDDMMYYYY[3]}-${datePartsDDMMYYYY[2]}-${datePartsDDMMYYYY[1]}`;
          } else if (datePartsYYYYMMDD) {
              postingDate = invoice.datum;
          } else {
            const d = new Date(invoice.datum);
            if (!isNaN(d.getTime())) {
                 postingDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            } else {
                postingDate = invoice.datum; 
            }
          }
      }

      const mainInvoiceData = [
        escapeTSVField(invoice.lieferantName),
        escapeTSVField(postingDate),
        escapeTSVField(invoice.rechnungsnummer),
        escapeTSVField(invoice.zahlungsziel),
        escapeTSVField(invoice.wahrung || 'EUR'),
        invoice.gesamtbetrag?.toString() ?? '',
      ];

      if (invoice.rechnungspositionen && invoice.rechnungspositionen.length > 0) {
        invoice.rechnungspositionen.forEach(item => {
          const itemData = [
            escapeTSVField(item.productCode),
            escapeTSVField(item.productName), // Using productName as description
            item.quantity.toString(),
            item.unitPrice.toString(),
          ];
          tsvString += mainInvoiceData.join('\t') + '\t' + itemData.join('\t') + '\n';
        });
      } else {
        const emptyItemData = ['', '', '', ''];
        tsvString += mainInvoiceData.join('\t') + '\t' + emptyItemData.join('\t') + '\n';
      }
    });

  } else { // Standard mode (not ERP mode)
    const regularInvoices = invoices as IncomingInvoiceItem[];
    const mainHeaders = [
      'PDF Datei', 'Rechnungsnummer', 'Datum', 'Lieferant Name', 'Lieferant Adresse',
      'Zahlungsziel', 'Zahlungsart', 'Gesamtbetrag', 'MwSt-Satz',
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
        const emptyItemData = ['', '', '', ''];
        tsvString += mainInvoiceData.join('\t') + '\t' + emptyItemData.join('\t') + '\n';
      }
    });
  }
  return tsvString;
}
    
