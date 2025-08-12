
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

// Schema for AI model output, aligned with the new robust prompt
const AIOutputSchema = z.object({
  supplier: z.string().nullable(),
  invoiceNumber: z.string().nullable(),
  invoiceDate: z.string().nullable().describe('The invoice date in YYYY-MM-DD format.'),
  currency: z.string().nullable(),
  items: z.array(AILineItemSchema).describe('An array of line items from the invoice.'),
  netAmount: z.number().nullable(),
  vatAmount: z.number().nullable(),
  grossAmount: z.number().nullable(),
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
  gesamtbetrag?: number | null;
  mwstSatz?: string;
  rechnungspositionen: AppLineItem[];
  kundenNummer?: string;
  bestellNummer?: string;
  isPaid?: boolean;
  error?: string;
  lieferdatum?: string;
  kundenName?: string;
  kundenAdresse?: string;
  nettoBetrag?: number | null;
  mwstBetrag?: number | null;
  waehrung?: string;
  steuersaetze?: { satz: string; basis: number; betrag: number }[];
  sonstigeAnmerkungen?: string;
}

// Helper function for product code normalization
function normalizeProductCode(code: any): string {
  let strCode = String(code || '').trim().replace(/\n/g, ' ');
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

  if (!rawOutput || rawOutput.error) {
    return { rechnungspositionen: [], error: rawOutput?.error || "The AI model returned no output." };
  }

  // Post-parse validation and normalization
  let { netAmount, vatAmount, grossAmount } = rawOutput;

    // Stricter validation and fallback calculation
    if (
    typeof vatAmount === 'number' &&
    typeof grossAmount === 'number' &&
    typeof netAmount !== 'number'
  ) {
    netAmount = (grossAmount as number) - (vatAmount as number);
    console.warn(
      `[Fallback Calculation] netAmount was calculated for invoice ${
        rawOutput.invoiceNumber || 'N/A'
      }`,
    );
  } else if (
    typeof netAmount === 'number' &&
    typeof grossAmount === 'number' &&
    typeof vatAmount !== 'number'
  ) {
    vatAmount = (grossAmount as number) - (netAmount as number);
    console.warn(
      `[Fallback Calculation] vatAmount was calculated for invoice ${
        rawOutput.invoiceNumber || 'N/A'
      }`,
    );
  } else if (
    typeof netAmount === 'number' &&
    typeof vatAmount === 'number' &&
    typeof grossAmount !== 'number'
  ) {
    grossAmount = (netAmount as number) + (vatAmount as number);
    console.warn(
      `[Fallback Calculation] grossAmount was calculated for invoice ${
        rawOutput.invoiceNumber || 'N/A'
      }`,
    );
  }

  // Final validation check after computation
  if (typeof netAmount !== 'number' || typeof vatAmount !== 'number' || typeof grossAmount !== 'number') {
      return {
          rechnungspositionen: [],
          error: `Invoice amounts are incomplete. Net: ${netAmount}, VAT: ${vatAmount}, Gross: ${grossAmount}`
      };
  }
  
  // Validate that the totals add up, allowing for small rounding differences
  if (Math.abs((netAmount + vatAmount) - grossAmount) > 0.02) {
      return {
          rechnungspositionen: [],
          error: `Totals do not add up. Net (${netAmount}) + VAT (${vatAmount}) = ${netAmount + vatAmount}, but Gross is ${grossAmount}.`
      };
  }

  const normalizedLineItems: AppLineItem[] = (rawOutput.items || []).map((item: any) => ({
    productCode: normalizeProductCode(item.productCode),
    productName: String(item.productName || item.description || '').trim().replace(/\n/g, ' '),
    quantity: typeof item.quantity === 'number' ? item.quantity : 0,
    unitPrice: typeof item.unitPrice === 'number' ? item.unitPrice : 0.0,
  }));

  // Simplified VAT rate calculation for display
  let mainVatRate = "";
  if (vatAmount > 0 && netAmount > 0) {
      mainVatRate = `${((vatAmount / netAmount) * 100).toFixed(0)}%`;
  }

  const normalizedOutput: ExtractIncomingInvoiceDataOutput = {
    rechnungsnummer: rawOutput.invoiceNumber ? String(rawOutput.invoiceNumber).trim() : undefined,
    datum: rawOutput.invoiceDate ? String(rawOutput.invoiceDate).trim() : undefined,
    lieferantName: rawOutput.supplier ? String(rawOutput.supplier).trim().replace(/\n/g, ' ') : undefined,
    nettoBetrag: netAmount,
    mwstBetrag: vatAmount,
    gesamtbetrag: grossAmount,
    waehrung: rawOutput.currency ? String(rawOutput.currency).trim() : 'EUR',
    mwstSatz: mainVatRate,
    rechnungspositionen: normalizedLineItems,
    // Defaulting other fields
    lieferantAdresse: "",
    zahlungsziel: "",
    zahlungsart: "",
    kundenNummer: "",
    bestellNummer: "",
    isPaid: false,
    lieferdatum: undefined,
    kundenName: "",
    kundenAdresse: "",
    steuersaetze: [],
    sonstigeAnmerkungen: "",
  };
  
  return normalizedOutput;
}

const prompt = ai.definePrompt({
  name: 'extractIncomingInvoiceDataPrompt',
  input: {schema: ExtractIncomingInvoiceDataInputSchema},
  output: {schema: AIOutputSchema},
  prompt: `
You are an expert invoice parser. Output **only** valid JSON matching this schema:

{
  "supplier": string | null,
  "invoiceNumber": string | null,
  "invoiceDate": "YYYY-MM-DD" | null,
  "currency": string | null,
  "items": [
    {
      "productCode": string | null,
      "productName": string | null,
      "quantity": number | null,
      "unitPrice": number | null,
      "totalPrice": number | null
    }, ...
  ],
  "netAmount": number | null,
  "vatAmount": number | null,
  "grossAmount": number | null
}

IMPORTANT:
- Extract all amounts as numbers (e.g., 1.234,56 becomes 1234.56).
- If one of the totals (netAmount, vatAmount, grossAmount) is missing, but the other two are present, CALCULATE the missing one.
  - netAmount = grossAmount - vatAmount
  - vatAmount = grossAmount - netAmount
  - grossAmount = netAmount + vatAmount
- Always return all three total fields, even if calculated.

### EXAMPLE 1
INPUT:
“Rechnung Nr.: 12345, Datum: 01.12.2024, Pos 1: Teppich (Code: TEP-01) 5 Stk à €28,59 = €142,95, Pos 2: Versandpauschale 1 Stk à €5,95 = €5,95, Zwischensumme: €148,90, MwSt 19%: €28,29, Gesamtbetrag: €177,19”
OUTPUT:
{
  "supplier": "Unknown Supplier",
  "invoiceNumber": "12345",
  "invoiceDate": "2024-12-01",
  "currency": "EUR",
  "items": [
    {"productCode":"TEP-01","productName":"Teppich","quantity":5,"unitPrice":28.59,"totalPrice":142.95},
    {"productCode":"VERSAND","productName":"Versandpauschale","quantity":1,"unitPrice":5.95,"totalPrice":5.95}
  ],
  "netAmount":148.90,
  "vatAmount":28.29,
  "grossAmount":177.19
}

### EXAMPLE 2 (grossAmount is missing, so it's calculated)
INPUT:
“Rechnung
Kunde: Max Mustermann
Rechnungsnummer: R-9876
Datum: 15.07.2024
Nettobetrag: 2525.00
Mehrwertsteuer (19%): 479.75”
OUTPUT:
{
  "supplier": "Unknown Supplier",
  "invoiceNumber": "R-9876",
  "invoiceDate": "2024-07-15",
  "currency": "EUR",
  "items": [],
  "netAmount":2525.00,
  "vatAmount":479.75,
  "grossAmount":3004.75
}

### NOW PARSE:
INPUT:
{{media url=invoiceDataUri}}
OUTPUT:
`.trim(),
});


const extractIncomingInvoiceDataFlow = ai.defineFlow(
  {
    name: 'extractIncomingInvoiceDataFlow',
    inputSchema: ExtractIncomingInvoiceDataInputSchema,
    outputSchema: AIOutputSchema,
  },
  async (input) => {
    try {
        const {output} = await prompt(input, {model: 'googleai/gemini-1.5-flash-latest'});
        if (!output) {
            return {
                supplier: null, invoiceNumber: null, invoiceDate: null, currency: null,
                items: [], netAmount: null, vatAmount: null, grossAmount: null,
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
            supplier: null, invoiceNumber: null, invoiceDate: null, currency: null,
            items: [], netAmount: null, vatAmount: null, grossAmount: null,
            error: errorMessage
        };
    }
  }
);

    