
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
      csvString += mainInvoiceData.join(',') + ',,,,\n'; 
    }
  });

  return csvString;
}

// Minimal ERPNext CSV Export
export function incomingInvoicesToERPNextCSV(invoices: ERPIncomingInvoiceItem[]): string {
  if (!invoices || invoices.length === 0) return '';

  const headers = [
    "supplier",              
    "posting_date",          
    "bill_no",               
    "currency",              
    "grand_total",           
    "items/item_code",       
    "items/description",     
    "items/qty",             
    "items/rate",            
  ];
  
  let csvString = headers.join(',') + '\n';

  invoices.forEach((invoice) => {
    const mainInvoiceData = [
      escapeCSVField(invoice.lieferantName), 
      escapeCSVField(invoice.datum), // Already YYYY-MM-DD from processing
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

// More Complete ERPNext CSV Export
export function incomingInvoicesToERPNextCSVComplete(invoices: ERPIncomingInvoiceItem[]): string {
  if (!invoices || invoices.length === 0) return '';

  const headers = [
    "supplier",
    "posting_date",
    "bill_no", // Supplier Invoice No
    "bill_date", // Often same as posting_date
    "due_date",
    "currency",
    "grand_total",
    "is_paid", // 0 or 1
    "debit_to", // Accounts Payable (Kontenrahmen)
    "remarks", // General remarks for the invoice
    // Item details
    "items/item_code",
    "items/description",
    "items/qty",
    "items/rate",
    "items/item_group", // Placeholder
    "items/warehouse", // Placeholder
    "items/cost_center" // Placeholder
  ];
  
  let csvString = headers.join(',') + '\n';

  invoices.forEach((invoice) => {
    const mainInvoiceData = [
      escapeCSVField(invoice.lieferantName), 
      escapeCSVField(invoice.datum), // posting_date
      escapeCSVField(invoice.rechnungsnummer),
      escapeCSVField(invoice.billDate || invoice.datum), // bill_date
      escapeCSVField(invoice.dueDate), // due_date
      escapeCSVField(invoice.wahrung || 'EUR'),
      invoice.gesamtbetrag?.toString() ?? '',
      invoice.istBezahlt?.toString() ?? '0',
      escapeCSVField(invoice.kontenrahmen),
      escapeCSVField(''), // remarks - empty for now
    ];

    if (invoice.rechnungspositionen && invoice.rechnungspositionen.length > 0) {
      invoice.rechnungspositionen.forEach(item => {
        const itemData = [
          escapeCSVField(item.productCode),
          escapeCSVField(item.productName), 
          item.quantity.toString(),
          item.unitPrice.toString(),
          escapeCSVField(''), // item_group
          escapeCSVField(''), // warehouse
          escapeCSVField(''), // cost_center
        ];
        csvString += mainInvoiceData.join(',') + ',' + itemData.join(',') + '\n';
      });
    } else {
       // Still output main invoice data even if no items
       const emptyItemData = ['', '', '', '', '', '', '']; 
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

export function incomingInvoicesToTSV(invoices: IncomingInvoiceItem[] | ERPIncomingInvoiceItem[], erpMode: boolean, useMinimalErpExport: boolean): string {
  if (!invoices || invoices.length === 0) return '';

  let tsvString = '';

  if (erpMode) {
    const erpInvoices = invoices as ERPIncomingInvoiceItem[];
    let headers: string[];
    
    if (useMinimalErpExport) {
      headers = ["supplier", "posting_date", "bill_no", "currency", "grand_total", "items/item_code", "items/description", "items/qty", "items/rate"];
    } else {
      headers = [
        "supplier", "posting_date", "bill_no", "bill_date", "due_date", "currency", "grand_total", "is_paid", "debit_to", "remarks",
        "items/item_code", "items/description", "items/qty", "items/rate", "items/item_group", "items/warehouse", "items/cost_center"
      ];
    }
    tsvString = headers.join('\t') + '\n';

    erpInvoices.forEach((invoice) => {
      const mainInvoiceBase = [
        escapeTSVField(invoice.lieferantName),
        escapeTSVField(invoice.datum), // posting_date
        escapeTSVField(invoice.rechnungsnummer),
      ];
      
      let mainInvoiceDataSpecific: (string|number|undefined|null)[] = [];
      if (useMinimalErpExport) {
        mainInvoiceDataSpecific = [
            escapeTSVField(invoice.wahrung || 'EUR'),
            invoice.gesamtbetrag?.toString() ?? '',
        ];
      } else {
         mainInvoiceDataSpecific = [
            escapeTSVField(invoice.billDate || invoice.datum),
            escapeTSVField(invoice.dueDate),
            escapeTSVField(invoice.wahrung || 'EUR'),
            invoice.gesamtbetrag?.toString() ?? '',
            invoice.istBezahlt?.toString() ?? '0',
            escapeTSVField(invoice.kontenrahmen),
            escapeTSVField(''), // remarks
         ];
      }
      const mainInvoiceData = [...mainInvoiceBase, ...mainInvoiceDataSpecific.map(f => escapeTSVField(f))];


      if (invoice.rechnungspositionen && invoice.rechnungspositionen.length > 0) {
        invoice.rechnungspositionen.forEach(item => {
          const itemBase = [
            escapeTSVField(item.productCode),
            escapeTSVField(item.productName),
            item.quantity.toString(),
            item.unitPrice.toString(),
          ];
          let itemSpecific: string[] = [];
          if (!useMinimalErpExport) {
            itemSpecific = [
                escapeTSVField(''), // item_group
                escapeTSVField(''), // warehouse
                escapeTSVField(''), // cost_center
            ];
          }
          const itemData = [...itemBase, ...itemSpecific];
          tsvString += mainInvoiceData.join('\t') + '\t' + itemData.join('\t') + '\n';
        });
      } else {
        const emptyItemCount = useMinimalErpExport ? 4 : 7;
        const emptyItemData = Array(emptyItemCount).fill('');
        tsvString += mainInvoiceData.join('\t') + '\t' + emptyItemData.join('\t') + '\n';
      }
    });

  } else { 
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
    
