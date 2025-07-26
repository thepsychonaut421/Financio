
'use server';
/**
 * @fileOverview Extracts detailed data from incoming invoices (Eingangsrechnungen).
 *
 * - extractIncomingInvoiceData - A function that extracts comprehensive details from an invoice PDF.
 * - ExtractIncomingInvoiceDataInput - The input type for the function.
 * - ExtractIncomingInvoiceDataOutput - The return type for the function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';
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
  rechnungsnummer: z.string().optional().describe('The invoice number (Rechnungsnummer). This must be the number explicitly and clearly labeled as "Rechnungs-Nr.", "Rechnungsnummer", or "Invoice No.". Absolutely do NOT use any number labeled "Bestell-Nr.", "Order Number", "Bestellnummer", "Auftragsnummer", or similar order/customer identifiers, NOR from the filename. If no value is explicitly labeled as "Rechnungs-Nr." or "Rechnungsnummer", this field must be left empty.'),
  datum: z.string().optional().describe('The invoice date (Datum), preferably in YYYY-MM-DD format (convert if DD.MM.YYYY). Look for labels like "Rechnungsdatum".'),
  lieferantName: z.string().optional().describe('The name of the supplier (Lieferant). Extract the name as it appears on the invoice.'),
  lieferantAdresse: z.string().optional().describe('The full address of the supplier (Adresse Lieferant).'),
  zahlungsziel: z.string().optional().describe('The payment terms (Zahlungsziel), e.g., "14 Tage netto", "sofort zahlbar".'),
  zahlungsart: z.string().optional().describe('The payment method (Zahlungsart), e.g., "Überweisung", "Sofort", "PayPal", "Lastschrift".'),
  gesamtbetrag: z.number().optional().describe('The total amount of the invoice (Gesamtbetrag) as a numeric value.'),
  mwstSatz: z.string().optional().describe('The VAT rate (MwSt.-Satz or USt.-Satz), e.g., "19%" or "7%".'),
  rechnungspositionen: z.array(AILineItemSchema).describe('An array of line items (Rechnungspositionen) from the invoice, including productCode, productName, quantity, and unitPrice. If quantity or unitPrice are not found, use 0 and 0.0 respectively.'),
  kundenNummer: z.string().optional().describe('The customer number (Kunden-Nr.) if present.'),
  bestellNummer: z.string().optional().describe('The order number (Bestell-Nr., Bestellnummer) if present and distinct from Rechnungsnummer.'),
  isPaid: z.boolean().optional().describe('Whether the invoice is marked as paid ("Bezahlt"). True if paid, false or undefined otherwise.'),
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
  mwstSatz?: string;
  rechnungspositionen: AppLineItem[];
  kundenNummer?: string;
  bestellNummer?: string;
  isPaid?: boolean; // This is what AI directly returns, will be mapped to istBezahlt in calling component
  error?: string;
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

  const normalizedOutput: ExtractIncomingInvoiceDataOutput = {
    rechnungsnummer: rawOutput.rechnungsnummer,
    datum: rawOutput.datum,
    lieferantName: String(rawOutput.lieferantName || '').trim().replace(/\n/g, ' '),
    lieferantAdresse: String(rawOutput.lieferantAdresse || '').trim().replace(/\n/g, ' '),
    zahlungsziel: String(rawOutput.zahlungsziel || '').trim().replace(/\n/g, ' '),
    zahlungsart: String(rawOutput.zahlungsart || '').trim().replace(/\n/g, ' '),
    gesamtbetrag: rawOutput.gesamtbetrag,
    mwstSatz: rawOutput.mwstSatz,
    kundenNummer: String(rawOutput.kundenNummer || '').trim(),
    bestellNummer: String(rawOutput.bestellNummer || '').trim(),
    isPaid: rawOutput.isPaid,
    rechnungspositionen: normalizedLineItems,
  };
  
  return normalizedOutput;
}

const prompt = ai.definePrompt({
  name: 'extractIncomingInvoiceDataPrompt',
  input: {schema: ExtractIncomingInvoiceDataInputSchema},
  output: {schema: AIOutputSchema}, // AI tries to fill this schema
  prompt: `You are an expert AI assistant specialized in extracting detailed information from German invoices (Eingangsrechnungen) for ERPNext integration.
You will receive an invoice as a data URI. Extract the following information meticulously:

Context: You are working with German "Eingangsrechnung" (purchase invoices). The goal is to accurately extract and structure data for import into ERPNext.
IMPORTANT: Some PDF files may contain a number in their title that is actually a Bestellnummer (order number), NOT the real invoice number (Rechnungsnummer). This has been a primary source of errors. Strictly follow the rules below to avoid confusion.

Extraction Rules for Invoices:

1.  Rechnungsnummer (Invoice Number):
    *   CRITICAL: Search ONLY for labels like "Rechnungs-Nr.", "Rechnungsnummer", "Invoice No."
    *   Absolutely DO NOT use numbers from the file title/filename or those labeled "Bestell-Nr.", "Bestellnummer", "Order Number", "Kunden-Nr.", "Customer Number", "Auftragsnummer".
    *   If a document has a title like "Rechnung 12345" but "12345" is also found next to "Bestell-Nr.", then "12345" is NOT the Rechnungsnummer.
    *   The Rechnungsnummer MUST have its own distinct "Rechnungs-Nr." or "Rechnungsnummer" label.
    *   If these specific labels are missing, leave the 'rechnungsnummer' field empty.

2.  Datum (Invoice Date / Rechnungsdatum):
    *   Look for labels like "Rechnungsdatum" or "Invoice Date". This will be the 'posting_date'.
    *   CRITICAL: Return the date in YYYY-MM-DD ISO format. If the invoice shows DD.MM.YYYY (e.g., 17.01.2025), you MUST convert it to YYYY-MM-DD (e.g., 2025-01-17).

3.  Lieferant (Supplier):
    *   Extract the supplier's name exactly as it appears on the invoice. Do not abbreviate or change it.
    *   If you cannot find a clear supplier name, return "UNBEKANNT".

4.  Lieferant Adresse (Supplier Address): The full postal address of the supplier. Clean any newline characters.

5.  Zahlungsziel (Payment Terms): e.g., "14 Tage netto", "sofort zahlbar". Clean any newline characters.

6.  Zahlungsart (Payment Method): e.g., "Überweisung", "PayPal", "Sofort", "Lastschrift". Clean any newline characters. If not explicitly mentioned, try to infer it from payment details if possible, or leave it empty.

7.  Gesamtbetrag (Total Amount): The final total amount of the invoice. This should be a numerical value. Parse it carefully.

8.  MwSt.-Satz (VAT Rate): e.g., "19%", "7%". If multiple VAT rates are present and a summary rate is not obvious, this can be omitted or you can list the most prominent one.

9.  Rechnungspositionen (Line Items): A list of all individual items or services. For each item, extract:
    *   productCode (item_code): The product code or article number (e.g., EAN). If not available, leave empty. This should be a plain string.
    *   productName (description): The name or description of the product/service. Clean string.
    *   quantity (qty): The quantity. If not explicitly stated for an item, use 0 for quantity.
    *   unitPrice (rate): The price per unit. If not explicitly stated for an item, use 0.0 for unitPrice.

10. Sonderfall Versandkosten (Special Case: Shipping Costs):
    *   Look for any line items or summary rows labeled 'Versandkosten', 'Versand', 'Fracht', or 'Lieferkosten'.
    *   If you find such a cost (like the 8,90 for 'Versandkosten' in the example image), you MUST create a separate, distinct line item for it in the 'rechnungspositionen' array.
    *   For this shipping line item, use these exact values: productCode should be "VERSAND", productName should be "Versandkostenpauschale", quantity should be 1, and unitPrice should be the numerical value of the shipping cost (e.g., 8.90).
    *   This is critical for accounting. Do not merge shipping costs into other items. If there are no shipping costs, do not add this item.

11. KundenNummer (Customer Number): Extract if labeled "Kunden-Nr." or similar.
12. BestellNummer (Order Number): Extract if labeled "Bestell-Nr.", "Bestellnummer", or similar, AND it is clearly distinct from the Rechnungsnummer.
13. isPaid: Determine if the invoice explicitly states it has been paid (e.g., contains the word "Bezahlt"). Set to true if paid, false or undefined otherwise.

Ensure all text fields are extracted as accurately as possible. For numerical fields like Gesamtbetrag, quantity, and unitPrice, provide them as numbers where available.

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
        return output || { rechnungspositionen: [] };
    } catch (e: any) {
        if (e.message && (e.message.includes('503') || e.message.includes('overloaded'))) {
            return { rechnungspositionen: [], error: "The AI service is currently busy or unavailable. Please try again in a few moments." };
        }
        return { rechnungspositionen: [], error: "An unexpected error occurred during invoice extraction." };
    }
  }
);
