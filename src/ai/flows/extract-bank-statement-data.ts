
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

// Schema for what the AI model will attempt to fill. Transaction reference ('id') is optional here.
const AIModelOutputTransactionSchema = z.object({
  id: z.string().optional().describe('The transaction reference number if present on the statement. If not, this can be omitted.'),
  date: z.string().describe('Transaction date. CRITICAL: Convert to YYYY-MM-DD format. E.g., "18.01.2025" becomes "2025-01-18".'),
  description: z.string().describe('The transaction description, booking text (Buchungstext), or purpose (Verwendungszweck).'),
  amount: z.number().describe('The transaction amount. IMPORTANT: Payments (debits, Soll, S) must be NEGATIVE. Income (credits, Haben, H) must be POSITIVE. Parse German numbers (e.g., "1.234,56" or "1234,56") to float.'),
  currency: z.string().optional().default('EUR').describe('The currency (e.g., EUR). Default to EUR if not specified.'),
  recipientOrPayer: z.string().optional().describe('The recipient or payer (Empfänger/Zahlungspflichtiger or Auftraggeber/Empfänger).'),
});

// Schema for the final, processed bank transaction data used by the application. ID is mandatory and system-generated.
const BankTransactionProcessedSchema = z.object({
  id: z.string().describe('A system-generated unique ID for the transaction.'),
  date: z.string().describe('Transaction date in YYYY-MM-DD format.'),
  description: z.string().describe('The transaction description.'),
  amount: z.number().describe('The transaction amount (negative for debits, positive for credits).'),
  currency: z.string().describe('The currency (e.g., EUR).'),
  recipientOrPayer: z.string().optional().describe('The recipient or payer.'),
});
export type BankTransactionAI = z.infer<typeof BankTransactionProcessedSchema>;


const ExtractBankStatementDataInputSchema = z.object({
  statementDataUri: z
    .string()
    .describe(
      "A bank statement PDF, as a data URI that must include a MIME type and use Base64 encoding. Expected format: 'data:<mimetype>;base64,<encoded_data>'."
    ),
});
export type ExtractBankStatementDataInput = z.infer<typeof ExtractBankStatementDataInputSchema>;

// Output schema uses the processed transaction schema with guaranteed unique IDs
const ExtractBankStatementDataOutputSchema = z.object({
  transactions: z.array(BankTransactionProcessedSchema).describe('An array of bank transactions with system-generated unique IDs.')
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
function ensureDateYYYYMMDD(dateStrRaw: string | undefined): string {
  const fallbackDate = '1900-01-01'; // Placeholder for unparsable dates

  if (!dateStrRaw || dateStrRaw.trim() === '') {
    console.warn('AI provided an empty or undefined date string. Using fallback.');
    return fallbackDate;
  }

  const dateStr = dateStrRaw.trim();

  // Try YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return dateStr;
  }

  // Try DD.MM.YYYY
  let match = dateStr.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (match) {
    return `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;
  }

  // Try DD/MM/YYYY
  match = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (match) {
    return `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;
  }
  
  // Try MM/DD/YYYY (less common for German statements, but as a fallback)
  match = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (match) {
     // This regex is ambiguous (DD/MM vs MM/DD). Prioritize DD/MM if day > 12.
     // For simplicity here, assume MM/DD if DD.MM and DD/MM failed.
     // A more robust solution might involve date-fns.parse with multiple format strings.
    return `${match[3]}-${match[1].padStart(2, '0')}-${match[2].padStart(2, '0')}`;
  }

  // Try YYYY.MM.DD
  match = dateStr.match(/^(\d{4})\.(\d{1,2})\.(\d{1,2})$/);
  if (match) {
    return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
  }
  
  // Try YYYY/MM/DD
  match = dateStr.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (match) {
    return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
  }

  // Fallback for other potential formats, trying Date constructor
  try {
    const d = new Date(dateStr);
    // Check if the date constructor successfully parsed it into a valid date
    if (!isNaN(d.getTime())) {
      // Further check: ensure year is somewhat reasonable to avoid epoch dates from bad parses
      const year = d.getFullYear();
      if (year > 1900 && year < 2100) {
        return d.toISOString().split('T')[0];
      }
    }
  } catch (e) { /* ignore if parsing fails */ }

  console.warn(`Could not parse date from AI output: "${dateStr}". Returning fallback date "${fallbackDate}".`);
  return fallbackDate; 
}


export async function extractBankStatementData(input: ExtractBankStatementDataInput): Promise<ExtractBankStatementDataOutput> {
  // The flow returns an object with a transactions property: { transactions: AIModelOutputTransactionSchema[] }
  const flowResult = await extractBankStatementDataFlow(input);
  const rawTransactionsFromAI = flowResult.transactions || [];

  const normalizedTransactions: BankTransactionAI[] = rawTransactionsFromAI.map(aiTx => {
    let parsedAmount = parseGermanNumberFromString(aiTx.amount);
    if (parsedAmount === null) {
        console.warn(`Could not parse amount for transaction: ${aiTx.description}. Defaulting to 0.`);
        parsedAmount = 0;
    }
    
    const finalDate = ensureDateYYYYMMDD(aiTx.date);

    return {
        id: uuidv4(), // Always generate a new, unique ID, ignoring any 'id' from AI
        date: finalDate,
        description: aiTx.description || '',
        amount: parsedAmount,
        currency: aiTx.currency || 'EUR',
        recipientOrPayer: aiTx.recipientOrPayer || '',
    };
  });

  return { transactions: normalizedTransactions };
}

const prompt = ai.definePrompt({
  name: 'extractBankStatementDataPrompt',
  input: {schema: ExtractBankStatementDataInputSchema},
  // The prompt's output schema matches what the AI model attempts to fill
  output: {schema: z.object({ transactions: z.array(AIModelOutputTransactionSchema) }) },
  prompt: `You are an expert AI assistant specialized in extracting transaction data from German bank statements (Kontoauszüge) provided as PDF data.
You will receive a bank statement as a data URI. Extract all individual transactions listed. For each transaction, provide the following information:

- id: The transaction reference number if present on the statement. If not, this can be omitted. (The system will assign its own unique ID later).
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

// The flow's outputSchema should reflect what the prompt is configured to output.
const extractBankStatementDataFlow = ai.defineFlow(
  {
    name: 'extractBankStatementDataFlow',
    inputSchema: ExtractBankStatementDataInputSchema,
    outputSchema: z.object({ transactions: z.array(AIModelOutputTransactionSchema) }), // This matches the prompt's output schema
  },
  async input => {
    const {output} = await prompt(input, {model: 'googleai/gemini-1.5-flash-latest'});
    return output!; // output will be { transactions: AIModelOutputTransactionSchema[] }
  }
);
