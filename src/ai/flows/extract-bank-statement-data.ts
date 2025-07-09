
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
  recipientOrPayer: z.string().optional().describe('The recipient (Empfänger/Zahlungspflichtiger) if an outgoing payment, or payer (Auftraggeber/Einzahler) if an incoming payment. Extract from labels or infer from description.'),
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
  const fallbackDate = '1900-01-01'; 

  if (!dateStrRaw || dateStrRaw.trim() === '') {
    console.warn('AI provided an empty or undefined date string for a transaction. Using fallback date "1900-01-01".');
    return fallbackDate;
  }

  const dateStr = dateStrRaw.trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) { // YYYY-MM-DD
    return dateStr;
  }

  let match = dateStr.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/); // DD.MM.YYYY
  if (match) {
    return `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;
  }
  
  match = dateStr.match(/^(\d{4})\.(\d{1,2})\.(\d{1,2})$/); // YYYY.MM.DD
  if (match) {
    return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
  }

  match = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); // DD/MM/YYYY
  if (match) {
    return `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;
  }
  
  match = dateStr.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/); // YYYY/MM/DD
  if (match) {
    return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
  }

  // Try MM/DD/YYYY (less common for German statements, but as a fallback after other attempts)
  // This regex is ambiguous with DD/MM/YYYY. Ensure it's tried after more specific DD.MM.YYYY or DD/MM/YYYY.
  if (dateStr.includes('/')) { // Basic check for slash, could be M/D/YYYY or MM/DD/YYYY
      match = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (match) {
          // To disambiguate, we could check if month > 12, but that's heuristics.
          // For now, assume if other DD/MM styles failed, this might be MM/DD.
          return `${match[3]}-${match[1].padStart(2, '0')}-${match[2].padStart(2, '0')}`;
      }
  }
  
  try {
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) {
      const year = d.getFullYear();
      if (year > 1900 && year < 2100) { // Basic sanity check for year
        return d.toISOString().split('T')[0];
      }
    }
  } catch (e) { /* ignore */ }

  console.warn(`Could not parse date from AI output: "${dateStr}". Returning fallback date "${fallbackDate}".`);
  return fallbackDate; 
}


export async function extractBankStatementData(input: ExtractBankStatementDataInput): Promise<ExtractBankStatementDataOutput> {
  const flowResult = await extractBankStatementDataFlow(input);
  const rawTransactionsFromAI = flowResult.transactions || [];

  const normalizedTransactions: BankTransactionAI[] = rawTransactionsFromAI.map(aiTx => {
    let parsedAmount = parseGermanNumberFromString(aiTx.amount);
    if (parsedAmount === null) {
        console.warn(`Could not parse amount for transaction (description: "${aiTx.description || 'N/A'}"). Defaulting amount to 0.`);
        parsedAmount = 0;
    }
    
    const finalDate = ensureDateYYYYMMDD(aiTx.date);

    return {
        id: uuidv4(), 
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
  output: {schema: z.object({ transactions: z.array(AIModelOutputTransactionSchema) }) },
  prompt: `You are an expert AI assistant specialized in extracting transaction data from German bank statements (Kontoauszüge) provided as PDF data.
You will receive a bank statement as a data URI. Your primary task is to meticulously extract ALL individual transactions listed on the statement. It is critical that no transaction is missed. Even if a transaction line has an unusual format or is missing some information, you should still attempt to extract what is available. Pay close attention to every line item that could represent a financial movement.

For each transaction, provide the following information:

- id: The transaction reference number if present on the statement. If not, this can be omitted. (The system will assign its own unique ID later).
- date: The transaction date (Buchungsdatum or Wertstellungsdatum). CRITICAL: Convert this date to YYYY-MM-DD format. For example, if the PDF shows "18.01.2025", you MUST output "2025-01-18". If it's already "2025-01-18", keep it as is.
- description: The transaction description or booking text (Buchungstext or Verwendungszweck). Include as much detail as possible from this field.
- amount: The transaction amount. IMPORTANT: Represent payments (debits, Soll, S, -) as NEGATIVE numbers and income (credits, Haben, H, +) as POSITIVE numbers. Parse German number formats correctly (e.g., "1.234,56" should become 1234.56, "- 50,00" should become -50.00).
- currency: The currency of the transaction (e.g., EUR). If not explicitly stated, assume EUR.
- recipientOrPayer: The recipient (Empfänger/Zahlungspflichtiger) if it's an outgoing payment (negative amount), or the payer (Auftraggeber/Einzahler) if it's an incoming payment (positive amount).
  *   First, look for explicit labels in the transaction details like "Empfänger:", "Begünst.:", "ZahlgPfl:", "Auftraggeber:", "Von:", "An:" etc., and extract the name following it.
  *   If no explicit label is found, carefully examine the 'description' (Buchungstext/Verwendungszweck).
      *   For outgoing payments (where amount is negative): If a company name (e.g., "Amazon Payments", "Netflix DE", "Vodafone Gmbh", "E.ON Energie", "Stadtwerke Musterstadt") or a person's name is clearly identifiable as the entity to whom the money was sent, extract that name as the recipient.
      *   For incoming payments (where amount is positive): If a company or person's name (e.g., "Max Mustermann", "Firma ABC GmbH", "Gehalt", "Mieteinnahme") is clearly identifiable as the source of the money, extract that name as the payer.
  *   Prioritize names that appear to be distinct entities rather than generic terms or parts of the transaction purpose itself unless they clearly denote the counterparty.
  *   If a clear recipient or payer cannot be reliably determined from the available information, leave this field empty. Do not guess or extract ambiguous information.

Focus on extracting data from tabular transaction listings. Pay attention to column headers like "Datum", "Buchungstag", "Valuta", "Buchungstext", "Verwendungszweck", "Betrag", "Währung", "Empfänger/Auftraggeber", "Begünstigter/Zahlungspflichtiger".
Some statements might use "S" or "H" next to the amount, or a "-" sign to indicate Soll (debit/negative) or Haben (credit/positive). Ensure the sign of the amount reflects this.

Return the information as a JSON object with a key "transactions" containing an array of transaction objects.

Bank Statement PDF: {{media url=statementDataUri}}`,
});

const extractBankStatementDataFlow = ai.defineFlow(
  {
    name: 'extractBankStatementDataFlow',
    inputSchema: ExtractBankStatementDataInputSchema,
    outputSchema: z.object({ transactions: z.array(AIModelOutputTransactionSchema) }),
  },
  async input => {
    const {output} = await prompt(input, {model: 'googleai/gemini-1.5-flash-latest'});
    return output!;
  }
);
