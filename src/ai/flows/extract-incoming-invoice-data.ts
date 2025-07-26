
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
  rechnungsnummer: z.string().optional().describe('The invoice number (Rechnungsnummer, Invoice No.). CRITICAL: Search ONLY for labels like "Rechnungs-Nr.", "Rechnungsnummer", "Invoice No.". Absolutely DO NOT use numbers from the file title/filename or those labeled "Bestell-Nr.", "Order Number", "Bestellnummer", "Auftragsnummer". If these specific labels are missing, leave this field empty.'),
  datum: z.string().optional().describe('The invoice date (Datum, Rechnungsdatum), preferably in YYYY-MM-DD format (convert if DD.MM.YYYY).'),
  lieferdatum: z.string().optional().describe('The delivery/service date (Lieferdatum), if different from the invoice date. Convert to YYYY-MM-DD.'),
  lieferantName: z.string().optional().describe('The name of the supplier (Lieferant). Extract the name as it appears on the invoice. If not found, return "UNBEKANNT".'),
  lieferantAdresse: z.string().optional().describe('The full address of the supplier (Adresse Lieferant).'),
  kundenName: z.string().optional().describe('The name of the customer/recipient (Kunde, Empfänger).'),
  kundenAdresse: z.string().optional().describe('The full address of the customer/recipient.'),
  kundenNummer: z.string().optional().describe('The customer number (Kunden-Nr.) if present.'),
  bestellNummer: z.string().optional().describe('The order number (Bestell-Nr., Bestellnummer) if present and distinct from Rechnungsnummer.'),
  
  // Financial Details
  nettoBetrag: z.number().optional().describe('The total net amount (Netto, Zwischensumme) before taxes.'),
  mwstBetrag: z.number().optional().describe('The total VAT amount (MwSt., USt.).'),
  bruttoBetrag: z.number().optional().describe('The final total amount of the invoice (Gesamtbetrag, Total, Amount Due) as a numeric value. This MUST match the payable amount.'),
  waehrung: z.string().optional().describe('The currency of the invoice (e.g., EUR, RON, USD).'),
  
  // Tax Details by Rate
  steuersaetze: z.array(z.object({
    satz: z.string().describe('The VAT rate, e.g., "19%" or "7%".'),
    basis: z.number().describe('The net amount (Basis) for this tax rate.'),
    betrag: z.number().describe('The tax amount (Betrag) for this rate.'),
  })).optional().describe('A list of VAT rates applied, with their respective base and tax amounts.'),

  // Payment Details
  zahlungsziel: z.string().optional().describe('The payment terms (Zahlungsziel), e.g., "14 Tage netto", "sofort zahlbar".'),
  zahlungsart: z.string().optional().describe('The payment method (Zahlungsart), e.g., "Überweisung", "PayPal", "Lastschrift".'),
  isPaid: z.boolean().optional().describe('Whether the invoice is marked as paid ("Bezahlt", "Paid"). True if paid, false or undefined otherwise.'),
  
  // Line Items
  rechnungspositionen: z.array(AILineItemSchema).describe('An array of line items (Rechnungspositionen) from the invoice, including productCode, productName, quantity, and unitPrice. If quantity or unitPrice are not found, use 0 and 0.0 respectively.'),

  // Legal Mentions
  sonstigeAnmerkungen: z.string().optional().describe('Any other special legal mentions found on the invoice (e.g., "Taxare inversă", "TVA la încasare", "Regimul marjei", "Scutit conform art...").'),
  
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
  prompt: `You are an expert AI assistant specialized in extracting detailed information from German and Romanian invoices (Eingangsrechnungen / Facturi) for ERPNext integration.
You will receive an invoice as a data URI. Extract the following information meticulously, following all rules.

Your response must be a valid JSON object. If a field is not found or is not applicable, output null for that field, but do not omit the key. Numbers must use a dot as a decimal separator.

**CRITICAL RULES for Data Extraction:**

1.  **Rechnungsnummer (Invoice Number):**
    *   Search **ONLY** for labels like "Rechnungs-Nr.", "Rechnungsnummer", "Invoice No.", "Factura nr.".
    *   **NEVER** use numbers from the file title/filename or those labeled "Bestell-Nr." (Order Number), "Kunden-Nr." (Customer Number), "Auftragsnummer", "PO Number".
    *   If a document has "Rechnung 12345" in the title, but "12345" is also next to "Bestell-Nr.", then it is **NOT** the Rechnungsnummer. The Rechnungsnummer must have its own distinct label.
    *   If no specific invoice number label is found, leave the field empty.

2.  **Datum (Invoice Date / Rechnungsdatum):**
    *   Look for "Rechnungsdatum", "Invoice Date", "Data Facturii".
    *   **CRITICAL:** Return the date in **YYYY-MM-DD** ISO format. Convert DD.MM.YYYY or other formats.

3.  **Lieferdatum (Delivery Date / Data Livrării):**
    *   Find the delivery or service date if it is different from the invoice date. Look for "Lieferdatum", "Leistungsdatum", "Service Date".
    *   Return in **YYYY-MM-DD** format.

4.  **Lieferant (Supplier / Furnizor):**
    *   Extract the supplier's name **exactly** as it appears. Do not abbreviate. If not found, return "UNBEKANNT".
    *   Extract the supplier's full postal address.

5.  **Kunde (Customer / Client):**
    *   Extract the customer's name and full postal address.

6.  **Finanzielle Details (Financials):**
    *   **nettoBetrag:** The total net amount before tax (Zwischensumme, Netto, Total fără TVA).
    *   **mwstBetrag:** The total VAT amount (MwSt., USt., Total TVA).
    *   **bruttoBetrag:** The **final, grand total** amount of the invoice (Gesamtbetrag, Total, Amount Due, Total de plată). This is the most important total.
    *   **waehrung:** The currency of the invoice (e.g., EUR, RON, USD).
    *   **steuersaetze:** Create an array for **each distinct VAT rate** found in the invoice summary. Each object in the array should contain:
        *   'satz': The rate (e.g., "19%", "9%").
        *   'basis': The net amount (base) for that specific rate.
        *   'betrag': The tax amount (betrag) for that specific rate.

7.  **Zahlungsdetails (Payment Details):**
    *   **zahlungsziel:** Payment terms (e.g., "14 Tage netto", "sofort zahlbar", "Plata la 30 de zile").
    *   **zahlungsart:** Payment method (e.g., "Überweisung", "PayPal", "Card").
    *   **isPaid:** Check for any text indicating the invoice is already paid (e.g., "Bezahlt", "Paid", "Achitat", "Summe erhalten"). Set to \`true\` if found.

8.  **Rechnungspositionen (Line Items / Linii de factură):**
    *   Create a list of all individual items. For each item, extract:
        *   \`productCode\` (item_code / Art.-Nr.): The product code or article number. If not available, leave it \`null\`.
        *   \`productName\` (description / Beschreibung): The name/description of the product/service.
        *   \`quantity\` (qty / Menge): The quantity. If not stated, use 1.
        *   \`unitPrice\` (rate / Einzelpreis): The price per unit (NET, without VAT). If not available, use 0.0.
    *   **Sonderfall Versandkosten (Special Case: Shipping Costs):**
        *   If you find a line for shipping costs ('Versandkosten', 'Versand', 'Fracht', 'Transport'), create a **separate line item** for it. Use "VERSAND" as \`productCode\` and "Versandkosten" (or similar) as \`productName\`.

9.  **Sonstige Anmerkungen (Other Mentions):**
    *   Scan the entire document for special legal mentions and combine them into a single string. Look for terms like "Taxare inversă", "Reverse Charge", "TVA la încasare", "Scutit conform art...", "Regimul marjei".

Return the full, structured JSON object.

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
               rechnungspositionen: [], 
               error: "Extraction failed: The AI could not determine the invoice's total amount (bruttoBetrag)." 
           };
        }
        return output;
    } catch (e: any) {
        console.error("Critical error in extractIncomingInvoiceDataFlow:", e);
        if (e.message && (e.message.includes('503') || e.message.includes('overloaded'))) {
            return { rechnungspositionen: [], error: "The AI service is currently busy or unavailable. Please try again in a few moments." };
        }
        return { rechnungspositionen: [], error: `An unexpected error occurred during invoice extraction: ${e.message}` };
    }
  }
);

    