
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
  items: z.array(AILineItemSchema).describe('An array of line items from the invoice.'),
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

  const normalizedLineItems: AppLineItem[] = (rawOutput.items || []).map(item => ({
    productCode: normalizeProductCode(item.productCode),
    productName: String(item.productName || '').trim().replace(/\n/g, ' '),
    quantity: item.quantity === null ? 0 : item.quantity,
    unitPrice: item.unitPrice === null ? 0.0 : item.unitPrice,
  }));

  // Determine the main VAT rate for the simplified 'mwstSatz' field for backward compatibility
  // This could be the one with the largest base amount.
  let mainVatRate = ""; // Deprecating mwstSatz
  if (rawOutput.mwstBetrag && rawOutput.nettoBetrag && rawOutput.nettoBetrag > 0) {
      mainVatRate = `${((rawOutput.mwstBetrag / rawOutput.nettoBetrag) * 100).toFixed(0)}%`;
  }


  const normalizedOutput: ExtractIncomingInvoiceDataOutput = {
    rechnungsnummer: rawOutput.invoiceNumber,
    datum: rawOutput.invoiceDate,
    lieferdatum: rawOutput.dueDate, // using dueDate as lieferdatum
    lieferantName: String(rawOutput.supplier || '').trim().replace(/\n/g, ' '),
    lieferantAdresse: "", // Not in new prompt
    kundenName: "", // Not in new prompt
    kundenAdresse: "", // Not in new prompt
    zahlungsziel: "", // Not in new prompt
    zahlungsart: "", // Not in new prompt
    nettoBetrag: rawOutput.nettoBetrag,
    mwstBetrag: rawOutput.mwstBetrag,
    gesamtbetrag: rawOutput.bruttoBetrag,
    waehrung: rawOutput.currency,
    steuersaetze: [], // Not in new prompt
    mwstSatz: mainVatRate,
    kundenNummer: "", // Not in new prompt
    bestellNummer: "", // Not in new prompt
    isPaid: false, // Not in new prompt
    rechnungspositionen: normalizedLineItems,
    sonstigeAnmerkungen: "",
  };
  
  return normalizedOutput;
}

const prompt = ai.definePrompt({
  name: 'extractIncomingInvoiceDataPrompt',
  input: {schema: ExtractIncomingInvoiceDataInputSchema},
  output: {schema: AIOutputSchema}, // AI tries to fill this schema
  prompt: `You are a powerful invoice data extractor. Your primary goal is to parse the content of an invoice PDF and return a structured JSON object.

For a given invoice, extract these fields into a JSON object. It is critical that you extract every field exactly as specified.

{
  "supplier": string | null,
  "invoiceNumber": string | null,
  "invoiceDate": string | null,
  "dueDate": string | null,
  "nettoBetrag": number | null,
  "mwstBetrag": number | null,
  "bruttoBetrag": number | null,
  "currency": string | null,
  "items": [
    {
      "productCode": string | null,
      "productName": string | null,
      "quantity": number | null,
      "unitPrice": number | null,
      "totalPrice": number | null
    }
  ]
}

## **Extraction Rules**

*   **Accuracy is key.** If a value is missing or cannot be determined, return \`null\` for that specific field. Do not guess or invent data.
*   **Numbers**: Always use a dot (.) as the decimal separator. Remove any thousands separators (like commas or periods).
*   **Dates**: Strictly use YYYY-MM-DD format. Convert from other formats (like DD.MM.YYYY) if necessary.
*   **Line Items**:
    *   **productCode**: Extract the item code, article number (Art.-Nr.), or SKU. If none is present for a line item, return \`null\`.
    *   **productName**: The name or description of the line item.
    *   **quantity**: The quantity.
    *   **unitPrice**: The net price per unit (Einzelpreis Netto).
    *   **totalPrice**: The total net price for the line (Gesamt Netto), which is typically quantity * unitPrice.
*   **Totals**:
    *   **nettoBetrag**: The total net amount of all items and services.
    *   **mwstBetrag**: The total VAT/tax amount for the entire invoice.
    *   **bruttoBetrag**: The final gross total to be paid (Gesamtbetrag, Total Amount).
*   **Currency**: The currency of the invoice (e.g., "EUR", "RON", "USD"). Look for symbols (€, $, RON) or codes.

The final output MUST be a single, valid JSON object that strictly follows this schema. Do not add any extra fields or introductory text.

Invoice Content: {{media url=invoiceDataUri}}
`,
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
        if (!output || output.bruttoBetrag === null || output.bruttoBetrag === undefined) {
           // If the main total is missing, the extraction is likely a failure.
           return { 
               supplier: null, invoiceNumber: null, invoiceDate: null, dueDate: null,
               nettoBetrag: null, mwstBetrag: null, bruttoBetrag: null, currency: null,
               items: [], 
               error: "Extraction failed: The AI could not determine the invoice's total amount (bruttoBetrag)." 
           };
        }
        return output;
    } catch (e: any) {
        console.error("Critical error in extractIncomingInvoiceDataFlow:", e);
        if (e.message && (e.message.includes('503') || e.message.includes('overloaded'))) {
            return { 
                supplier: null, invoiceNumber: null, invoiceDate: null, dueDate: null,
                nettoBetrag: null, mwstBetrag: null, bruttoBetrag: null, currency: null,
                items: [], error: "The AI service is currently busy or unavailable. Please try again in a few moments." };
        }
        return { 
            supplier: null, invoiceNumber: null, invoiceDate: null, dueDate: null,
            nettoBetrag: null, mwstBetrag: null, bruttoBetrag: null, currency: null,
            items: [], error: `An unexpected error occurred during invoice extraction: ${e.message}` };
    }
  }
);
