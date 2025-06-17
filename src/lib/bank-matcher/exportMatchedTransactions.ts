
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

const COMMON_HEADERS = [
  'Tx Date', 'Tx Description', 'Tx Amount', 'Tx Currency', 'Tx Payer/Recipient',
  'Match Status', 'Match Confidence',
  'Matched Invoice PDF', 'Matched Invoice No', 'Matched Invoice Supplier',
  'Matched Invoice Date', 'Matched Invoice Total', 'Matched Invoice Currency'
];

function getRowData(match: MatchedTransaction): (string | number | undefined | null)[] {
  const { transaction, matchedInvoice, status, confidence } = match;
  return [
    transaction.date,
    transaction.description,
    transaction.amount,
    transaction.currency,
    transaction.recipientOrPayer,
    status,
    confidence !== undefined ? (confidence * 100).toFixed(0) + '%' : 'N/A',
    matchedInvoice?.pdfFileName,
    matchedInvoice?.rechnungsnummer,
    matchedInvoice?.lieferantName,
    matchedInvoice?.datum, // This is invoice date (posting_date)
    matchedInvoice?.gesamtbetrag,
    matchedInvoice?.wahrung
  ];
}

export function matchedTransactionsToCSV(matches: MatchedTransaction[]): string {
  if (!matches || matches.length === 0) return '';

  const csvRows = [
    COMMON_HEADERS.join(','),
    ...matches.map(match => getRowData(match).map(escapeCSVField).join(','))
  ];
  return csvRows.join('\n');
}

export function matchedTransactionsToTSV(matches: MatchedTransaction[]): string {
  if (!matches || matches.length === 0) return '';

  const tsvRows = [
    COMMON_HEADERS.join('\t'),
    ...matches.map(match => getRowData(match).map(escapeTSVField).join('\t'))
  ];
  return tsvRows.join('\n');
}

export function matchedTransactionsToJSON(matches: MatchedTransaction[]): string {
  const structuredData = matches.map(match => {
    const rowArray = getRowData(match);
    const rowObject: Record<string, any> = {};
    COMMON_HEADERS.forEach((header, index) => {
      rowObject[header.replace(/\s+/g, '_').toLowerCase()] = rowArray[index];
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
