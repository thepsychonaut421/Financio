import Papa from 'papaparse';
import { z } from 'zod';
import type { BankTransaction } from '@/lib/erpnext/types';

// Schema describing a generic bank CSV row. The parser is liberal in
// accepting column names by mapping common variants to this shape.
const BankCsvRowSchema = z.object({
  date: z.string(),
  description: z.string().optional(),
  amount: z.string(),
  reference_number: z.string().optional(),
});
export type BankCsvRow = z.infer<typeof BankCsvRowSchema>;

/**
 * Parse a CSV string containing bank transactions. The parser accepts a
 * header row and will skip empty lines. Column names are matched in a
 * case-insensitive manner and support common aliases such as
 * "Datum", "Betrag" etc.
 */
export function parseBankCSV(csv: string): BankCsvRow[] {
  const parsed = Papa.parse<Record<string, string>>(csv, {
    header: true,
    skipEmptyLines: true,
  });
  const rows: BankCsvRow[] = [];
  for (const raw of parsed.data) {
    const row = BankCsvRowSchema.safeParse({
      date: raw.date || raw.Date || raw.Datum,
      description:
        raw.description ||
        raw.Description ||
        raw.Buchungstext ||
        raw.Verwendungszweck,
      amount: raw.amount || raw.Amount || raw.Betrag,
      reference_number: raw.reference_number || raw.Reference || raw.Ref,
    });
    if (row.success) rows.push(row.data);
  }
  return rows;
}

// Helper to normalise European number formats (e.g. "1.234,56")
function parseAmount(str: string): number {
  const cleaned = str.replace(/\./g, '').replace(/,/g, '.').trim();
  const num = Number(cleaned);
  return Number.isNaN(num) ? 0 : num;
}

/**
 * Convert parsed CSV rows into ERPNext Bank Transaction payloads. The bank
 * account is supplied externally because it is installation specific.
 */
export function toBankTransactions(rows: BankCsvRow[], account: string): BankTransaction[] {
  return rows.map(row => {
    const amount = parseAmount(row.amount);
    return {
      doctype: 'Bank Transaction',
      date: row.date,
      account,
      description: row.description,
      reference_number: row.reference_number,
      deposit: amount > 0 ? amount : undefined,
      withdrawal: amount < 0 ? -amount : undefined,
    };
  });
}
