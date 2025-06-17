import type { IncomingInvoiceItem } from '@/types/incoming-invoice';

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

function escapeCSVField(field: string | number | undefined): string {
  if (field === undefined || field === null) return '';
  const stringField = String(field);
  // Escape double quotes by doubling them, and wrap in double quotes if it contains comma, newline or double quote
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
      invoice.gesamtbetrag?.toString() ?? '', // Numbers don't need special escaping unless they become strings with commas
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
      // If no line items, still write the main invoice data with empty item columns
      csvString += mainInvoiceData.join(',') + ',,,,\n'; 
    }
  });

  return csvString;
}

export function incomingInvoicesToJSON(invoices: IncomingInvoiceItem[]): string {
  return JSON.stringify(invoices, null, 2);
}

function escapeTSVField(field: string | number | undefined): string {
  if (field === undefined || field === null) return '';
  // For TSV, replace tabs and newlines. Quotes are generally not an issue unless the importing system is strict.
  return String(field).replace(/\t/g, ' ').replace(/\n/g, ' ');
}

export function incomingInvoicesToTSV(invoices: IncomingInvoiceItem[]): string {
  if (!invoices || invoices.length === 0) return '';

  const mainHeaders = [
    'PDF Datei',
    'Rechnungsnummer',
    'Datum',
    'Lieferant Name',
    'Lieferant Adresse',
    'Zahlungsziel',
    'Gesamtbetrag',
    'MwSt-Satz',
  ];
  const itemHeaders = ['Pos. Produkt Code', 'Pos. Produkt Name', 'Pos. Menge', 'Pos. Einzelpreis'];
  
  let tsvString = mainHeaders.join('\t') + '\t' + itemHeaders.join('\t') + '\n';

  invoices.forEach((invoice) => {
    const mainInvoiceData = [
      escapeTSVField(invoice.pdfFileName),
      escapeTSVField(invoice.rechnungsnummer),
      escapeTSVField(invoice.datum),
      escapeTSVField(invoice.lieferantName),
      escapeTSVField(invoice.lieferantAdresse),
      escapeTSVField(invoice.zahlungsziel),
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
  return tsvString;
}
