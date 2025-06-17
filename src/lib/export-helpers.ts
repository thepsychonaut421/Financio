
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

export function incomingInvoicesToERPNextCSV(invoices: ERPIncomingInvoiceItem[]): string {
  if (!invoices || invoices.length === 0) return '';

  const headers = [
    "Supplier Invoice No",        // rechnungsnummer
    "Posting Date",               // datum (format YYYY-MM-DD)
    "Supplier",                   // lieferantName
    "Supplier Address",           // lieferantAdresse
    "Payment Terms Template",     // zahlungsziel
    "Payment Method",             // zahlungsart
    "Grand Total",                // gesamtbetrag
    "Total Taxes and Charges",    // mwstSatz (could be enhanced to calculate value)
    "Is Paid",                    // istBezahlt (0 or 1)
    "Accounts Payable",           // kontenrahmen
    "Currency",                   // wahrung (e.g., EUR)
    "PDF File Name",              // pdfFileName
    "Item Code",                  // rechnungspositionen.productCode
    "Item Name",                  // rechnungspositionen.productName
    "Qty",                        // rechnungspositionen.quantity
    "Rate"                        // rechnungspositionen.unitPrice
  ];
  
  let csvString = headers.join(',') + '\n';

  invoices.forEach((invoice) => {
    let postingDate = invoice.datum || '';
    if (invoice.datum) {
        const dateParts = invoice.datum.match(/(\d{2})\.(\d{2})\.(\d{4})/); 
        if (dateParts && dateParts[3] && dateParts[2] && dateParts[1]) {
            postingDate = `${dateParts[3]}-${dateParts[2]}-${dateParts[1]}`;
        } else if (!invoice.datum.match(/^\d{4}-\d{2}-\d{2}$/)) {
            postingDate = invoice.datum; 
        }
    }

    const mainInvoiceData = [
      escapeCSVField(invoice.rechnungsnummer),
      escapeCSVField(postingDate),
      escapeCSVField(invoice.lieferantName),
      escapeCSVField(invoice.lieferantAdresse),
      escapeCSVField(invoice.zahlungsziel),
      escapeCSVField(invoice.zahlungsart),
      invoice.gesamtbetrag?.toString() ?? '',
      escapeCSVField(invoice.mwstSatz), 
      invoice.istBezahlt?.toString() ?? '0',
      escapeCSVField(invoice.kontenrahmen),
      escapeCSVField(invoice.wahrung || 'EUR'),
      escapeCSVField(invoice.pdfFileName),
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
    const headers = [
      "Supplier Invoice No", "Posting Date", "Supplier", "Supplier Address", 
      "Payment Terms Template", "Payment Method", "Grand Total", "Total Taxes and Charges", 
      "Is Paid", "Accounts Payable", "Currency", "PDF File Name", 
      "Item Code", "Item Name", "Qty", "Rate"
    ];
    tsvString = headers.join('\t') + '\n';

    erpInvoices.forEach((invoice) => {
      let postingDate = invoice.datum || '';
      if (invoice.datum) {
          const dateParts = invoice.datum.match(/(\d{2})\.(\d{2})\.(\d{4})/);
          if (dateParts && dateParts[3] && dateParts[2] && dateParts[1]) {
              postingDate = `${dateParts[3]}-${dateParts[2]}-${dateParts[1]}`;
          } else if (!invoice.datum.match(/^\d{4}-\d{2}-\d{2}$/)) {
              postingDate = invoice.datum;
          }
      }

      const mainInvoiceData = [
        escapeTSVField(invoice.rechnungsnummer),
        escapeTSVField(postingDate),
        escapeTSVField(invoice.lieferantName),
        escapeTSVField(invoice.lieferantAdresse),
        escapeTSVField(invoice.zahlungsziel),
        escapeTSVField(invoice.zahlungsart),
        invoice.gesamtbetrag?.toString() ?? '',
        escapeTSVField(invoice.mwstSatz),
        invoice.istBezahlt?.toString() ?? '0',
        escapeTSVField(invoice.kontenrahmen),
        escapeTSVField(invoice.wahrung || 'EUR'),
        escapeTSVField(invoice.pdfFileName),
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
        tsvString += mainInvoiceData.join('\t') + '\t\t\t\t\n';
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
        tsvString += mainInvoiceData.join('\t') + '\t\t\t\t\n';
      }
    });
  }
  return tsvString;
}

    