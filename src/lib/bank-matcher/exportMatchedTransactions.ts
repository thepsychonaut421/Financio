
'use client';

import type { MatchedTransaction } from './types';
import type { ERPIncomingInvoiceItem } from '@/types/incoming-invoice';

function escapeCSVField(field: string | number | undefined | null): string {
  if (field === undefined || field === null) return '';
  const stringField = String(field);
  // Escape double quotes and handle commas, newlines
  if (stringField.includes('"') || stringField.includes(',') || stringField.includes('\n') || stringField.includes('\r')) {
    return `"${stringField.replace(/"/g, '""')}"`;
  }
  return stringField;
}

function escapeTSVField(field: string | number | undefined | null): string {
    if (field === undefined || field === null) return '';
    return String(field).replace(/\t/g, ' ').replace(/\n/g, ' ').replace(/\r/g, ' ');
}

const DETAILED_HEADERS = [
  // Transaction Fields
  'Tx ID', 'Tx Date', 'Tx Description', 'Tx Amount', 'Tx Currency', 'Tx Recipient/Payer',
  // Match Fields
  'Match Status', 'Match Confidence (%)',
  // Matched Invoice Fields (ERPIncomingInvoiceItem)
  'Inv PDF File Name', 'Inv Rechnungsnummer', 'Inv Datum (Invoice Date)', 
  'Inv Lieferant Name', 'Inv Lieferant Adresse', 'Inv Zahlungsziel', 'Inv Zahlungsart',
  'Inv Gesamtbetrag (Total)', 'Inv Währung (Currency)', 'Inv MwSt-Satz (VAT Rate)',
  'Inv Kunden-Nummer', 'Inv Bestell-Nummer', 'Inv isPaid (AI Extraction)',
  'Inv istBezahlt (0/1 ERP Status)', 'Inv Kontenrahmen (Account)',
  'Inv Bill Date (ERP)', 'Inv Due Date (ERP)', 'Inv Remarks (ERP)',
  'Inv ERPNext Internal Name'
];

function getDetailedRowData(match: MatchedTransaction): (string | number | undefined | null)[] {
  const { transaction, matchedInvoice, status, confidence } = match;
  return [
    // Transaction
    transaction.id,
    transaction.date,
    transaction.description,
    transaction.amount,
    transaction.currency,
    transaction.recipientOrPayer,
    // Match
    status,
    confidence !== undefined ? (confidence * 100).toFixed(0) + '%' : 'N/A',
    // Invoice (handle null matchedInvoice)
    matchedInvoice?.pdfFileName,
    matchedInvoice?.rechnungsnummer,
    matchedInvoice?.datum,
    matchedInvoice?.lieferantName,
    matchedInvoice?.lieferantAdresse,
    matchedInvoice?.zahlungsziel,
    matchedInvoice?.zahlungsart,
    matchedInvoice?.gesamtbetrag,
    matchedInvoice?.wahrung,
    matchedInvoice?.mwstSatz,
    matchedInvoice?.kundenNummer,
    matchedInvoice?.bestellNummer,
    matchedInvoice?.isPaidByAI,
    matchedInvoice?.istBezahlt,
    matchedInvoice?.kontenrahmen,
    matchedInvoice?.billDate,
    matchedInvoice?.dueDate,
    matchedInvoice?.remarks,
    matchedInvoice?.erpNextInvoiceName,
  ];
}

export function matchedTransactionsToCSV(matches: MatchedTransaction[]): string {
  if (!matches || matches.length === 0) return '';

  const csvRows = [
    DETAILED_HEADERS.map(escapeCSVField).join(','),
    ...matches.map(match => getDetailedRowData(match).map(escapeCSVField).join(','))
  ];
  return csvRows.join('\n');
}

export function matchedTransactionsToTSV(matches: MatchedTransaction[]): string {
  if (!matches || matches.length === 0) return '';

  const tsvRows = [
    DETAILED_HEADERS.map(escapeTSVField).join('\t'),
    ...matches.map(match => getDetailedRowData(match).map(escapeTSVField).join('\t'))
  ];
  return tsvRows.join('\n');
}

export function matchedTransactionsToJSON(matches: MatchedTransaction[]): string {
  const structuredData = matches.map(match => {
    const rowArray = getDetailedRowData(match);
    const rowObject: Record<string, any> = {};
    DETAILED_HEADERS.forEach((header, index) => {
      // Create a more JSON-friendly key
      const jsonKey = header
        .replace(/\(%\)/g, 'Percentage') // Replace (%) with Percentage
        .replace(/\(.*\)/g, '')       // Remove other parentheses content
        .replace(/\s+/g, '_')          // Replace spaces with underscores
        .replace(/[^a-zA-Z0-9_]/g, '') // Remove special characters except underscore
        .trim()
        .toLowerCase();
      rowObject[jsonKey || `field_${index}`] = rowArray[index];
    });
    return rowObject;
  });
  return JSON.stringify(structuredData, null, 2);
}

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
