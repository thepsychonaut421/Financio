
'use client';

import type { BankTransactionAI } from '@/ai/flows/extract-bank-statement-data';
import { format as formatDateFns, parseISO, isValid } from 'date-fns';


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

const STANDARD_HEADERS = [
  'ID', 'Date', 'Description', 'Amount', 'Currency', 'Recipient/Payer'
];

function getTransactionRowDataStandard(transaction: BankTransactionAI): (string | number | undefined | null)[] {
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
    STANDARD_HEADERS.join(','),
    ...transactions.map(tx => getTransactionRowDataStandard(tx).map(escapeCSVField).join(','))
  ];
  return csvRows.join('\n');
}

export function bankTransactionsToTSV(transactions: BankTransactionAI[]): string {
  if (!transactions || transactions.length === 0) return '';

  const tsvRows = [
    STANDARD_HEADERS.join('\t'),
    ...transactions.map(tx => getTransactionRowDataStandard(tx).map(escapeTSVField).join('\t'))
  ];
  return tsvRows.join('\n');
}

export function bankTransactionsToJSON(transactions: BankTransactionAI[]): string {
  const structuredData = transactions.map(tx => {
    const rowArray = getTransactionRowDataStandard(tx);
    const rowObject: Record<string, any> = {};
    STANDARD_HEADERS.forEach((header, index) => {
      const jsonKey = header.replace(/\//g, '_').replace(/\s+/g, '_').toLowerCase();
      rowObject[jsonKey] = rowArray[index];
    });
    return rowObject;
  });
  return JSON.stringify(structuredData, null, 2);
}

// ERPNext Bank Reconciliation Tool Export
const ERPNEXT_BANK_REC_HEADERS = [
  'Datum', 'Einzahlung', 'Auszahlung', 'Beschreibung', 'Referenznummer', 'Bankkonto', 'Währung'
];

function formatDateForERPNext(dateString: string): string {
    try {
        const date = parseISO(dateString); // Assumes dateString is already YYYY-MM-DD
        if (isValid(date)) {
            return formatDateFns(date, 'yyyy-MM-dd');
        }
    } catch(e) {
        // Fallback for other potential formats, though should not be needed if AI flow is correct
        try {
            const d = new Date(dateString);
            if(isValid(d)) return formatDateFns(d, 'yyyy-MM-dd');
        } catch(e2) {
             console.error(`Could not parse date: ${dateString}`);
             return dateString; // return original if all fails
        }
    }
    return dateString; 
}


function getTransactionRowDataERPNextBankRec(transaction: BankTransactionAI, erpBankAccountName: string): (string | number | undefined | null)[] {
  const einzahlung = transaction.amount > 0 ? transaction.amount : 0;
  const auszahlung = transaction.amount < 0 ? Math.abs(transaction.amount) : 0;
  
  return [
    formatDateForERPNext(transaction.date), // Format date to YYYY-MM-DD
    einzahlung,
    auszahlung,
    transaction.description,
    transaction.recipientOrPayer || '', // Use recipientOrPayer as Referenznummer
    erpBankAccountName, // Use the dynamic bank account name
    transaction.currency,
  ];
}

export function bankTransactionsToERPNextBankRecCSV(transactions: BankTransactionAI[], erpBankAccountName: string): string {
  if (!transactions || transactions.length === 0) return '';

  const csvRows = [
    ERPNEXT_BANK_REC_HEADERS.join(','),
    ...transactions.map(tx => getTransactionRowDataERPNextBankRec(tx, erpBankAccountName).map(escapeCSVField).join(','))
  ];
  return csvRows.join('\n');
}
