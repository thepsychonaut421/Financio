
'use server';
/**
 * @fileOverview Extracts detailed data from incoming invoices (Eingangsrechnungen).
 *
 * - extractIncomingInvoiceData - A function that extracts comprehensive details from an invoice PDF.
 * - ExtractIncomingInvoiceDataInput - The input type for the function.
 * - ExtractIncomingInvoiceDataOutput - The return type for the function.
 */

import {ai} from '@/ai/genkit';
import {z}from 'genkit';
import { AILineItemSchema, type AppLineItem } from '@/ai/schemas/invoice-item-schema';

const ExtractIncomingInvoiceDataInputSchema = z.object({
  invoiceDataUri: z
    .string()
    .describe(
      "An invoice PDF, as a data URI that must include a MIME type and use Base64 encoding. Expected format: 'data:<mimetype>;base64,<encoded_data>'."
    ),
});
export type ExtractIncomingInvoiceDataInput = z.infer<typeof ExtractIncomingInvoiceDataInputSchema>;

// Schema for AI model output (uses AILineItemSchema for flexibility)
const AIOutputSchema = z.object({
  supplier: z.string().nullable().describe("The supplier's name, exactly as printed."),
  invoiceNumber: z.string().nullable().describe('The invoice number.'),
  invoiceDate: z.string().nullable().describe('The invoice date in YYYY-MM-DD format.'),
  dueDate: z.string().nullable().describe('The due date in YYYY-MM-DD format.'),
  nettoBetrag: z.number().nullable().describe('The total net amount.'),
  mwstBetrag: z.number().nullable().describe('The total VAT amount.'),
  bruttoBetrag: z.number().nullable().describe('The final gross total amount of the invoice.'),
  currency: z.string().nullable().describe('The currency (e.g., "EUR", "RON").'),
  items: z.array(z.object({
      description: z.string().nullable(),
      quantity: z.number().nullable(),
      unitPrice: z.number().nullable(),
      totalPrice: z.number().nullable(),
  })).describe('An array of line items from the invoice.'),
  error: z.string().optional().describe('An error message if the operation failed.'),
});


// Type for the exported function's return value (uses AppLineItem for stricter line items)
export type ExtractIncomingInvoiceDataOutput = {
  rechnungsnummer?: string;
  datum?: string;
  lieferantName?: string;
  lieferantAdresse?: string;
  zahlungsziel?: string;
  zahlungsart?: string;
  gesamtbetrag?: number;
  mwstSatz?: string; // This can be deprecated or derived from steuersaetze
  rechnungspositionen: AppLineItem[];
  kundenNummer?: string;
  bestellNummer?: string;
  isPaid?: boolean; // This is what AI directly returns, will be mapped to istBezahlt in calling component
  error?: string;
  // Add new fields from AIOutputSchema that you want to pass to the frontend
  lieferdatum?: string;
  kundenName?: string;
  kundenAdresse?: string;
  nettoBetrag?: number;
  mwstBetrag?: number;
  waehrung?: string;
  steuersaetze?: { satz: string; basis: number; betrag: number }[];
  sonstigeAnmerkungen?: string;
}

// Helper function for product code normalization
function normalizeProductCode(code: any): string {
  let strCode = String(code || '').trim().replace(/\n/g, ' ');
  if (/^[-+]?[0-9]*\.?[0-9]+([eE][-+]?[0-9]+)$/.test(strCode)) {
    const num = Number(strCode);
    if (!isNaN(num) && isFinite(num)) {
      return num.toString();
    }
  }
  return strCode;
}


export async function extractIncomingInvoiceData(input: ExtractIncomingInvoiceDataInput): Promise<ExtractIncomingInvoiceDataOutput> {
  const rawOutput = await extractIncomingInvoiceDataFlow(input);

  if (rawOutput.error) {
    return { rechnungspositionen: [], error: rawOutput.error };
  }

  const normalizedLineItems: AppLineItem[] = (rawOutput.rechnungspositionen || []).map(item => ({
    productCode: normalizeProductCode(item.productCode),
    productName: String(item.productName || '').trim().replace(/\n/g, ' '),
    quantity: item.quantity === undefined ? 0 : item.quantity,
    unitPrice: item.unitPrice === undefined ? 0.0 : item.unitPrice,
  }));

  // Determine the main VAT rate for the simplified 'mwstSatz' field for backward compatibility
  // This could be the one with the largest base amount.
  let mainVatRate = ""; // Deprecating mwstSatz
  if (rawOutput.steuersaetze && rawOutput.steuersaetze.length > 0) {
      mainVatRate = rawOutput.steuersaetze.reduce((prev, current) => (prev.basis > current.basis) ? prev : current).satz;
  }


  const normalizedOutput: ExtractIncomingInvoiceDataOutput = {
    rechnungsnummer: rawOutput.rechnungsnummer,
    datum: rawOutput.datum,
    lieferdatum: rawOutput.lieferdatum,
    lieferantName: String(rawOutput.lieferantName || '').trim().replace(/\n/g, ' '),
    lieferantAdresse: String(rawOutput.lieferantAdresse || '').trim().replace(/\n/g, ' '),
    kundenName: String(rawOutput.kundenName || '').trim(),
    kundenAdresse: String(rawOutput.kundenAdresse || '').trim(),
    zahlungsziel: String(rawOutput.zahlungsziel || '').trim().replace(/\n/g, ' '),
    zahlungsart: String(rawOutput.zahlungsart || '').trim().replace(/\n/g, ' '),
    nettoBetrag: rawOutput.nettoBetrag,
    mwstBetrag: rawOutput.mwstBetrag,
    gesamtbetrag: rawOutput.bruttoBetrag, // Using bruttoBetrag as the main total
    waehrung: rawOutput.waehrung,
    steuersaetze: rawOutput.steuersaetze,
    mwstSatz: mainVatRate,
    kundenNummer: String(rawOutput.kundenNummer || '').trim(),
    bestellNummer: String(rawOutput.bestellNummer || '').trim(),
    isPaid: rawOutput.isPaid,
    rechnungspositionen: normalizedLineItems,
    sonstigeAnmerkungen: rawOutput.sonstigeAnmerkungen,
  };
  
  return normalizedOutput;
}

const prompt = ai.definePrompt({
  name: 'extractIncomingInvoiceDataPrompt',
  input: {schema: ExtractIncomingInvoiceDataInputSchema},
  output: {schema: AIOutputSchema}, // AI tries to fill this schema
  prompt: `You are an invoice data extractor. 
Given the text of a single invoice, output a JSON object with these exact fields:

{
  "supplier": string | null,
  "invoiceNumber": string | null,
  "invoiceDate": string | null,       // ISO format YYYY-MM-DD
  "dueDate": string | null,           // ISO format
  "nettoBetrag": number | null,       // total net amount
  "mwstBetrag": number | null,        // VAT amount
  "bruttoBetrag": number | null,      // gross total
  "currency": string | null,          // e.g. "EUR", "RON"
  "items": [
    {
      "description": string | null,
      "quantity": number | null,
      "unitPrice": number | null,
      "totalPrice": number | null
    }
  ]
}

Rules:
- If any number cannot be parsed, return null.
- Use dot (.) for decimals.
- Dates: YYYY-MM-DD.
- Do NOT output extra fields.

Invoice: {{media url=invoiceDataUri}}`,
});


const extractIncomingInvoiceDataFlow = ai.defineFlow(
  {
    name: 'extractIncomingInvoiceDataFlow',
    inputSchema: ExtractIncomingInvoiceDataInputSchema,
    outputSchema: AIOutputSchema, // Flow's direct output matches AI's schema
  },
  async (input) => {
    try {
        const {output} = await prompt(input, {model: 'googleai/gemini-1.5-flash-latest'});
        // Basic validation: ensure the most important field is present
        if (!output || !output.bruttoBetrag) {
           // If the main total is missing, the extraction is likely a failure.
           return { 
               items: [], 
               error: "Extraction failed: The AI could not determine the invoice's total amount (bruttoBetrag)." 
           };
        }
        return output;
    } catch (e: any) {
        console.error("Critical error in extractIncomingInvoiceDataFlow:", e);
        if (e.message && (e.message.includes('503') || e.message.includes('overloaded'))) {
            return { items: [], error: "The AI service is currently busy or unavailable. Please try again in a few moments." };
        }
        return { items: [], error: `An unexpected error occurred during invoice extraction: ${e.message}` };
    }
  }
);
