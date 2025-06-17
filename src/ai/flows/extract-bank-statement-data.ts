
'use server';
/**
 * @fileOverview Extracts transaction data from bank statement PDFs.
 *
 * - extractBankStatementData - A function that extracts bank transactions from a PDF.
 * - ExtractBankStatementDataInput - The input type for the function.
 * - ExtractBankStatementDataOutput - The return type for the function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { v4 as uuidv4 } from 'uuid'; 

// Schema for AI output, ensures compatibility with BankTransaction from bank-matcher/types
const BankTransactionAISchema = z.object({
  id: z.string().describe('A unique ID for the transaction. Generate one if not present.'),
  date: z.string().describe('Transaction date. CRITICAL: Convert to YYYY-MM-DD format. E.g., "18.01.2025" becomes "2025-01-18".'),
  description: z.string().describe('The transaction description, booking text (Buchungstext), or purpose (Verwendungszweck).'),
  amount: z.number().describe('The transaction amount. IMPORTANT: Payments (debits, Soll, S) must be NEGATIVE. Income (credits, Haben, H) must be POSITIVE. Parse German numbers (e.g., "1.234,56" or "1234,56") to float.'),
  currency: z.string().optional().default('EUR').describe('The currency (e.g., EUR). Default to EUR if not specified.'),
  recipientOrPayer: z.string().optional().describe('The recipient or payer (Empfänger/Zahlungspflichtiger or Auftraggeber/Empfänger).'),
});
export type BankTransactionAI = z.infer<typeof BankTransactionAISchema>;


const ExtractBankStatementDataInputSchema = z.object({
  statementDataUri: z
    .string()
    .describe(
      "A bank statement PDF, as a data URI that must include a MIME type and use Base64 encoding. Expected format: 'data:<mimetype>;base64,<encoded_data>'."
    ),
});
export type ExtractBankStatementDataInput = z.infer<typeof ExtractBankStatementDataInputSchema>;

const ExtractBankStatementDataOutputSchema = z.object({
  transactions: z.array(BankTransactionAISchema).describe('An array of bank transactions extracted from the statement.')
});
export type ExtractBankStatementDataOutput = z.infer<typeof ExtractBankStatementDataOutputSchema>;

// Helper to parse German numbers from string if AI returns string amount
function parseGermanNumberFromString(numStr: any): number | null {
  if (typeof numStr === 'number') return numStr;
  if (typeof numStr !== 'string' || !numStr) return null;
  const cleanedStr = numStr.replace(/\./g, '').replace(/,/g, '.');
  const num = parseFloat(cleanedStr);
  return isNaN(num) ? null : num;
}

// Helper to ensure date is YYYY-MM-DD
function ensureDateYYYYMMDD(dateStr: string | undefined): string {
  if (!dateStr) return new Date().toISOString().split('T')[0]; // Fallback, should not happen
  // Try DD.MM.YYYY
  const matchDMY = dateStr.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (matchDMY) {
    const day = matchDMY[1].padStart(2, '0');
    const month = matchDMY[2].padStart(2, '0');
    const year = matchDMY[3];
    return `${year}-${month}-${day}`;
  }
  // Try YYYY-MM-DD (already correct)
  if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
    return dateStr;
  }
  // Fallback for other potential formats, trying Date constructor
  try {
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) {
      return d.toISOString().split('T')[0];
    }
  } catch (e) { /* ignore if parsing fails */ }
  console.warn(`Could not parse date from AI output: ${dateStr}. Returning as is or fallback.`);
  return dateStr; // Return original if AI couldn't format and other methods fail
}


export async function extractBankStatementData(input: ExtractBankStatementDataInput): Promise<ExtractBankStatementDataOutput> {
  const rawOutput = await extractBankStatementDataFlow(input);

  const normalizedTransactions: BankTransactionAI[] = (rawOutput.transactions || []).map(tx => {
    let parsedAmount = parseGermanNumberFromString(tx.amount);
    if (parsedAmount === null) {
        console.warn(`Could not parse amount for transaction: ${tx.description}. Defaulting to 0.`);
        parsedAmount = 0;
    }
    
    const finalDate = ensureDateYYYYMMDD(tx.date);

    return {
        id: tx.id || uuidv4(), 
        date: finalDate,
        description: tx.description || '',
        amount: parsedAmount,
        currency: tx.currency || 'EUR',
        recipientOrPayer: tx.recipientOrPayer || '',
    };
  });

  return { transactions: normalizedTransactions };
}

const prompt = ai.definePrompt({
  name: 'extractBankStatementDataPrompt',
  input: {schema: ExtractBankStatementDataInputSchema},
  output: {schema: ExtractBankStatementDataOutputSchema},
  // Removed model property, will use global default from src/ai/genkit.ts
  prompt: `You are an expert AI assistant specialized in extracting transaction data from German bank statements (Kontoauszüge) provided as PDF data.
You will receive a bank statement as a data URI. Extract all individual transactions listed. For each transaction, provide the following information:

- id: Generate a unique ID for each transaction (e.g., using a UUID v4 format).
- date: The transaction date (Buchungsdatum or Wertstellungsdatum). CRITICAL: Convert this date to YYYY-MM-DD format. For example, if the PDF shows "18.01.2025", you MUST output "2025-01-18". If it's already "2025-01-18", keep it as is.
- description: The transaction description or booking text (Buchungstext or Verwendungszweck). Include as much detail as possible from this field.
- amount: The transaction amount. IMPORTANT: Represent payments (debits, Soll, S, -) as NEGATIVE numbers and income (credits, Haben, H, +) as POSITIVE numbers. Parse German number formats correctly (e.g., "1.234,56" should become 1234.56, "- 50,00" should become -50.00).
- currency: The currency of the transaction (e.g., EUR). If not explicitly stated, assume EUR.
- recipientOrPayer: The recipient or payer (Empfänger/Zahlungspflichtiger or Auftraggeber/Empfänger). If the transaction is a payment, this is often the recipient. If it's income, this is often the payer.

Focus on extracting data from tabular transaction listings. Pay attention to column headers like "Datum", "Buchungstag", "Valuta", "Buchungstext", "Verwendungszweck", "Betrag", "Währung", "Empfänger/Auftraggeber", "Begünstigter/Zahlungspflichtiger".
Some statements might use "S" or "H" next to the amount, or a "-" sign to indicate Soll (debit/negative) or Haben (credit/positive). Ensure the sign of the amount reflects this.

Return the information as a JSON object with a key "transactions" containing an array of transaction objects.

Bank Statement PDF: {{media url=statementDataUri}}`,
});

const extractBankStatementDataFlow = ai.defineFlow(
  {
    name: 'extractBankStatementDataFlow',
    inputSchema: ExtractBankStatementDataInputSchema,
    outputSchema: ExtractBankStatementDataOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
