
'use client';

import type { BankTransactionAI } from '@/ai/flows/extract-bank-statement-data';

// Re-using downloadFile from another helper as it's generic
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

function escapeTSVField(field: string | number | undefined | null): string {
    if (field === undefined || field === null) return '';
    return String(field).replace(/\t/g, ' ').replace(/\n/g, ' ').replace(/\r/g, ' ');
}

const HEADERS = [
  'ID', 'Date', 'Description', 'Amount', 'Currency', 'Recipient/Payer'
];

function getTransactionRowData(transaction: BankTransactionAI): (string | number | undefined | null)[] {
  return [
    transaction.id,
    transaction.date,
    transaction.description,
    transaction.amount,
    transaction.currency,
    transaction.recipientOrPayer,
  ];
}

export function bankTransactionsToCSV(transactions: BankTransactionAI[]): string {
  if (!transactions || transactions.length === 0) return '';

  const csvRows = [
    HEADERS.join(','),
    ...transactions.map(tx => getTransactionRowData(tx).map(escapeCSVField).join(','))
  ];
  return csvRows.join('\n');
}

export function bankTransactionsToTSV(transactions: BankTransactionAI[]): string {
  if (!transactions || transactions.length === 0) return '';

  const tsvRows = [
    HEADERS.join('\t'),
    ...transactions.map(tx => getTransactionRowData(tx).map(escapeTSVField).join('\t'))
  ];
  return tsvRows.join('\n');
}

export function bankTransactionsToJSON(transactions: BankTransactionAI[]): string {
  const structuredData = transactions.map(tx => {
    const rowArray = getTransactionRowData(tx);
    const rowObject: Record<string, any> = {};
    HEADERS.forEach((header, index) => {
      // Create JSON-friendly keys (e.g., "Recipient/Payer" -> "recipient_payer")
      const jsonKey = header.replace(/\//g, '_').replace(/\s+/g, '_').toLowerCase();
      rowObject[jsonKey] = rowArray[index];
    });
    return rowObject;
  });
  return JSON.stringify(structuredData, null, 2);
}
