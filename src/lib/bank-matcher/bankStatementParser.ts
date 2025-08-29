import Papa from 'papaparse';
import type { BankTransaction, BankStatementCSVRow } from './types';
import { v4 as uuidv4 } from 'uuid'; // For generating unique IDs

// Helper to parse German numbers (e.g., "1.234,56" or "1234,56") to float
function parseGermanNumber(numStr: string | undefined): number | null {
  if (!numStr) return null;
  const cleanedStr = numStr.replace(/\./g, '').replace(/,/g, '.');
  const num = parseFloat(cleanedStr);
  return isNaN(num) ? null : num;
}

// Helper to parse various date formats to YYYY-MM-DD
function parseDate(dateStr: string | undefined): string | null {
  if (!dateStr) return null;
  
  // Try DD.MM.YYYY
  const matchDMY = dateStr.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (matchDMY) {
    const day = matchDMY[1].padStart(2, '0');
    const month = matchDMY[2].padStart(2, '0');
    const year = matchDMY[3];
    return `${year}-${month}-${day}`;
  }

  // Try YYYY-MM-DD
  const matchYMD = dateStr.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (matchYMD) {
    const year = matchYMD[1];
    const month = matchYMD[2].padStart(2, '0');
    const day = matchYMD[3].padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  
  // Try to parse with Date constructor as a fallback (less reliable for specific formats)
  try {
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) {
      return d.toISOString().split('T')[0];
    }
  } catch (e) {
    // ignore
  }

  console.warn(`Could not parse date: ${dateStr}`);
  return null; // Or throw an error, or return original string
}


export async function parseBankStatementCSV(file: File): Promise<BankTransaction[]> {
  return new Promise((resolve, reject) => {
    Papa.parse<BankStatementCSVRow>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (results.errors.length > 0) {
          console.error("CSV Parsing errors:", results.errors);
          // Potentially reject only on critical errors or provide partial data
        }
        
        const transactions = results.data
          .map((row, index): BankTransaction | null => {
            const date = parseDate(row['Datum'] || row['Date']);
            const amount = parseGermanNumber(row['Betrag'] || row['Amount']);
            const description =
              row['Buchungstext'] || row['Description'] || row['Verwendungszweck'] || '';

            if (!date || amount === null) {
              console.warn(
                `Skipping row ${index + 2} due to missing/invalid date or amount:`,
                row,
              );
              return null;
            }

            return {
              id: uuidv4(), // Generate a unique ID
              date,
              description,
              amount,
              currency: row['Währung'] || row['Currency'] || undefined,
              recipientOrPayer:
                row['Empfänger/Zahlungspflichtiger'] ||
                row['Auftraggeber/Empfänger'] ||
                row['Name'] ||
                undefined,
            };
          })
          .filter((t): t is BankTransaction => t !== null); // Filter out nulls

        resolve(transactions);
      },
      error: (error: Error) => {
        console.error("PapaParse error:", error);
        reject(error);
      },
    });
  });
}
