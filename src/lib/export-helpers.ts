
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

// Complete ERPNext CSV Export
export function incomingInvoicesToERPNextCSVComplete(invoices: ERPIncomingInvoiceItem[]): string {
  if (!invoices || invoices.length === 0) return '';

  const headers = [
    "supplier",
    "posting_date",
    "bill_no", 
    "bill_date", 
    "due_date", 
    "currency",
    "grand_total",
    "is_paid", 
    "debit_to", 
    "remarks", 
    // Item details
    "item_code",
    "item_name", // Changed from items/description
    "qty",
    "rate",
    "item_group", 
    "warehouse", 
    "cost_center" 
  ];
  
  let csvString = headers.join(',') + '\n';

  invoices.forEach((invoice) => {
    const mainInvoiceData = [
      escapeCSVField(invoice.lieferantName), 
      escapeCSVField(invoice.datum), 
      escapeCSVField(invoice.rechnungsnummer),
      escapeCSVField(invoice.billDate || invoice.datum), 
      escapeCSVField(invoice.dueDate), 
      escapeCSVField(invoice.wahrung || 'EUR'),
      invoice.gesamtbetrag?.toString() ?? '',
      invoice.istBezahlt?.toString() ?? '0',
      escapeCSVField(invoice.kontenrahmen),
      escapeCSVField(invoice.remarks), 
    ];

    if (invoice.rechnungspositionen && invoice.rechnungspositionen.length > 0) {
      invoice.rechnungspositionen.forEach(item => {
        const itemData = [
          escapeCSVField(item.productCode),
          escapeCSVField(item.productName), 
          item.quantity.toString(),
          item.unitPrice.toString(),
          escapeCSVField(''), 
          escapeCSVField(''), 
          escapeCSVField(''), 
        ];
        csvString += mainInvoiceData.join(',') + ',' + itemData.join(',') + '\n';
      });
    } else {
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
  return String(field).replace(/\t/g, ' ').replace(/\n/g, ' ').replace(/\r/g, ' ');
}

export function incomingInvoicesToTSV(invoices: IncomingInvoiceItem[] | ERPIncomingInvoiceItem[], erpMode: boolean, useMinimalErpExport: boolean): string {
  if (!invoices || invoices.length === 0) return '';

  let tsvString = '';

  if (erpMode) {
    const erpInvoices = invoices as ERPIncomingInvoiceItem[];
    let headers: string[];
    
    if (useMinimalErpExport) {
      headers = ["supplier", "posting_date", "bill_no", "currency", "grand_total", "item_code", "item_name", "qty", "rate"];
    } else {
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
                '', 
                '', 
                '', 
            ];
          }
          const itemDataEscaped = itemData.map(f => escapeTSVField(f));
          tsvString += mainInvoiceDataEscaped.join('\t') + '\t' + itemDataEscaped.join('\t') + '\n';
        });
      } else {
        const emptyItemCount = useMinimalErpExport ? 4 : 7;
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
