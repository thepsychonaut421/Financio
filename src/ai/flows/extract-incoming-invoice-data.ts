
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

  const normalizedLineItems: AppLineItem[] = (rawOutput.items || []).map(item => ({
    // AI schema uses `description`, `totalPrice`, our app uses productName/unitPrice etc.
    // This mapping normalizes it.
    productCode: normalizeProductCode(null), // The new AI prompt doesn't extract item_code yet.
    productName: String(item.description || '').trim().replace(/\n/g, ' '),
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
  prompt: 'You are a powerful invoice data extractor. Your primary goal is to parse the content of an invoice PDF and return a structured JSON object.\n\nYou must handle two types of invoice layouts: Standard and SELLIXX.\n\n## **Instructions for Standard Invoices**\n\nFor most invoices, extract these fields into a JSON object:\n{\n  "supplier": string | null,          // The supplier\'s full name, exactly as printed.\n  "invoiceNumber": string | null,     // The unique invoice number (e.g., "Rechnungs-Nr.", "Invoice No.").\n  "invoiceDate": string | null,       // The issue date of the invoice, formatted as YYYY-MM-DD.\n  "dueDate": string | null,           // The payment due date, formatted as YYYY-MM-DD.\n  "nettoBetrag": number | null,       // The total net amount of all items and services.\n  "mwstBetrag": number | null,        // The total VAT/tax amount.\n  "bruttoBetrag": number | null,      // The final gross total to be paid.\n  "currency": string | null,          // The currency (e.g., "EUR", "RON", "USD").\n  "items": [\n    {\n      "description": string | null,   // The name or description of the line item.\n      "quantity": number | null,      // The quantity.\n      "unitPrice": number | null,     // The net price per unit.\n      "totalPrice": number | null     // The total net price for the line (quantity * unitPrice).\n    }\n  ]\n}\n\n## **SPECIAL Instructions for SELLIXX Invoices**\n\nIf you detect the supplier is **SELLIXX**, their invoices have a unique, simpler format. Follow these specific rules:\n1.  **Header**: The invoice number is in the format "Rechnung YYYY/NNNNNN". Extract this.\n2.  **Table**: The table has columns "Menge", "Artikel", "Preis in EUR". "Preis" is the GROSS price per unit.\n3.  **Line Items**: For each item in the table:\n    *   `description`: The "Artikel".\n    *   `quantity`: The "Menge".\n    *   `unitPrice`: This is tricky. You must calculate the NET unit price. Assume a 19% VAT rate. The "Preis" column is the GROSS unit price. So, `unitPrice` (net) = "Preis" / 1.19.\n    *   `totalPrice`: Calculated net total for the line: `quantity * unitPrice`.\n4.  **Footer Totals**: At the bottom of the invoice, you will find:\n    *   "Gesamtpreis (Netto)": Use this for the main `nettoBetrag`.\n    *   "MwSt. 19%": This is the VAT on the items.\n    *   "MwSt. Versand 19%": This is the VAT on shipping.\n    *   `mwstBetrag`: For the main JSON field, this is the SUM of "MwSt. 19%" and "MwSt. Versand 19%".\n    *   "Rechnungsendbetrag in EUR": Use this for the main `bruttoBetrag`.\n5.  **Shipping**: The shipping cost ("Versandkosten") should be created as a separate line item in the `items` array. Its `description` should be "Versandkosten", `quantity` is 1, and its `totalPrice` (net) is "Gesamtpreis (Netto)" minus the sum of all other items\' net totals.\n\n## **General Rules for All Invoices**\n\n*   **Accuracy is key.** If a value is missing, return `null`. Do not guess.\n*   **Numbers**: Always use a dot (.) as the decimal separator.\n*   **Dates**: Strictly use YYYY-MM-DD format.\n*   **JSON Output**: The final output MUST be a single, valid JSON object matching the schema. Do not add extra fields.\n\nInvoice Content: {{media url=invoiceDataUri}}\n',
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

    

    