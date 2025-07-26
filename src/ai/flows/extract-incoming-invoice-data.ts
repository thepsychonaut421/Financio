
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
      "An invoice PDF, as a data URI that must include a MIME type and use Base64 encoding. Expected format: 'data:<mimetype>;base64,<encoded_data>'"
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
  gesamtbetrag?: number | null; // Allow null to be passed to frontend
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
  nettoBetrag?: number | null; // Allow null
  mwstBetrag?: number | null; // Allow null
  waehrung?: string;
  steuersaetze?: { satz: string; basis: number; betrag: number }[];
  sonstigeAnmerkungen?: string;
}

// Helper function for product code normalization
function normalizeProductCode(code: any): string {
  let strCode = String(code || '').trim().replace(/
/g, ' ');
  if (/^[-+]?[0-9]*.?[0-9]+([eE][-+]?[0-9]+)$/.test(strCode)) {
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

   const data = JSON.parse(JSON.stringify(rawOutput)); // Create a deep copy to avoid modifying rawOutput

    // Validate and normalize data
    if (!Array.isArray(data.items) || data.items.some((i: any) => isNaN(i.totalPrice) || i.totalPrice === null)) {
      throw new Error("Line items parsing failed or contained invalid total prices.");
    }

  const normalizedLineItems: AppLineItem[] = (data.items || []).map((item: any) => ({
    productCode: normalizeProductCode(item.productCode),
    productName: String(item.productName || '').trim().replace(/
/g, ' '),
    quantity: item.quantity === null ? 0 : item.quantity,
    unitPrice: item.unitPrice === null ? 0.0 : item.unitPrice,
  }));

  // Determine the main VAT rate for the simplified 'mwstSatz' field for backward compatibility
  // This could be the one with the largest base amount.
  let mainVatRate = ""; // Deprecating mwstSatz
  if (data.mwstBetrag && data.nettoBetrag && data.nettoBetrag > 0) {
      mainVatRate = `${((data.mwstBetrag / data.nettoBetrag) * 100).toFixed(0)}%`;
  }


  const normalizedOutput: ExtractIncomingInvoiceDataOutput = {
    rechnungsnummer: data.invoiceNumber,
    datum: data.invoiceDate,
    lieferdatum: data.dueDate, // using dueDate as lieferdatum
    lieferantName: String(data.supplier || '').trim().replace(/
/g, ' '),
    lieferantAdresse: "", // Not in new prompt
    kundenName: "", // Not in new prompt
    kundenAdresse: "", // Not in new prompt
    zahlungsziel: "", // Not in new prompt
    zahlungsart: "", // Not in new prompt
    nettoBetrag: data.nettoBetrag,
    mwstBetrag: data.mwstBetrag,
    gesamtbetrag: data.bruttoBetrag,
    waehrung: data.currency,
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
  prompt: `
YouYou are a highly-accurate invoice parser. 
You will receive the full text of a single German invoice PDF.
Output **only** valid JSON matching this schema:

{
  "supplier": string,
  "invoiceNumber": string,
  "date": "YYYY-MM-DD",
  "currency": string,
  "items": [
    {
      "description": string,
      "quantity": number,
      "unitPrice": number,
      "totalLine": number
    }, ...
  ],
  "netAmount": number,
  "vatAmount": number,
  "grossAmount": number
}

### EXAMPLE 1
INPUT:
“Rechnung Nr.: 12345
 Datum: 01.12.2024
 Pos 1: Teppich 5 Stk à €28,59 = €142,95
 Pos 2: Versandpauschale 1 Stk à €5,95 = €5,95
 Zwischensumme: €148,90
 MwSt 19%: €28,29
 Gesamtbetrag: €177,19”
OUTPUT:
{
  "supplier": "Mustermann GmbH",
  "invoiceNumber": "12345",
  "date": "2024-12-01",
  "currency": "EUR",
  "items": [
    {"description":"Teppich","quantity":5,"unitPrice":28.59,"totalLine":142.95},
    {"description":"Versandpauschale","quantity":1,"unitPrice":5.95,"totalLine":5.95}
  ],
  "netAmount":148.90,
  "vatAmount":28.29,
  "grossAmount":177.19
}

### EXAMPLE 2
INPUT:
“Rechnung
Kunde: Max Mustermann
Rechnungsnummer: R-9876
Datum: 15.07.2024
Währung: EUR
Artikel:
1. Laptop ABC x 2 @ 1200.00 = 2400.00
2. Maus XYZ x 5 @ 25.00 = 125.00
Nettobetrag: 2525.00
Mehrwertsteuer (19%): 479.75
Gesamtbetrag: 3004.75”
OUTPUT:
{
  "supplier": "Tech Solutions AG",
  "invoiceNumber": "R-9876",
  "date": "2024-07-15",
  "currency": "EUR",
  "items": [
    {"description":"Laptop ABC","quantity":2,"unitPrice":1200.00,"totalLine":2400.00},
    {"description":"Maus XYZ","quantity":5,"unitPrice":25.00,"totalLine":125.00}
  ],
  "netAmount":2525.00,
  "vatAmount":479.75,
  "grossAmount":3004.75
}

### NOW PARSE:
INPUT:
"""${invoiceDataUri}"""
OUTPUT:
`.trim(),
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
        // Always return the output, even if it's partially null.
        // The calling function will handle validation and error display.
        if (!output) {
            return {
                supplier: null, invoiceNumber: null, invoiceDate: null, dueDate: null,
                nettoBetrag: null, mwstBetrag: null, bruttoBetrag: null, currency: null,
                items: [],
                error: "The AI model returned no output."
            };
        }
        return output;
    } catch (e: any) {
        console.error("Critical error in extractIncomingInvoiceDataFlow:", e);
        const errorMessage = e.message && (e.message.includes('503') || e.message.includes('overloaded'))
            ? "The AI service is currently busy or unavailable. Please try again in a few moments."
            : `An unexpected error occurred during invoice extraction: ${e.message}`;

        return {
            supplier: null, invoiceNumber: null, invoiceDate: null, dueDate: null,
            nettoBetrag: null, mwstBetrag: null, bruttoBetrag: null, currency: null,
            items: [],
            error: errorMessage
        };
    }
  }
);

    