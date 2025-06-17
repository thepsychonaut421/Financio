
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
import { ExtractedItemSchema as InvoiceLineItemSchema } from '@/ai/schemas/invoice-item-schema';

const ExtractIncomingInvoiceDataInputSchema = z.object({
  invoiceDataUri: z
    .string()
    .describe(
      "An invoice PDF, as a data URI that must include a MIME type and use Base64 encoding. Expected format: 'data:<mimetype>;base64,<encoded_data>'."
    ),
});
export type ExtractIncomingInvoiceDataInput = z.infer<typeof ExtractIncomingInvoiceDataInputSchema>;

const ExtractIncomingInvoiceDataOutputSchema = z.object({
  rechnungsnummer: z.string().optional().describe('The invoice number (Rechnungsnummer). This must be the number explicitly and clearly labeled as "Rechnungs-Nr.", "Rechnungsnummer", or "Invoice No.". Absolutely do NOT use any number labeled "Bestell-Nr.", "Order Number", "Bestellnummer", "Auftragsnummer", or similar order/customer identifiers, NOR from the filename. If no value is explicitly labeled as "Rechnungs-Nr." or "Rechnungsnummer", this field must be left empty.'),
  datum: z.string().optional().describe('The invoice date (Datum), preferably in YYYY-MM-DD format (convert if DD.MM.YYYY). Look for labels like "Rechnungsdatum".'),
  lieferantName: z.string().optional().describe('The name of the supplier (Lieferant). Try to match to the ERPNext supplier name from the provided list. If no match, return the extracted name or "UNBEKANNT".'),
  lieferantAdresse: z.string().optional().describe('The full address of the supplier (Adresse Lieferant).'),
  zahlungsziel: z.string().optional().describe('The payment terms (Zahlungsziel), e.g., "14 Tage netto", "sofort zahlbar".'),
  zahlungsart: z.string().optional().describe('The payment method (Zahlungsart), e.g., "Überweisung", "Sofort", "PayPal", "Lastschrift".'),
  gesamtbetrag: z.number().optional().describe('The total amount of the invoice (Gesamtbetrag) as a numeric value.'),
  mwstSatz: z.string().optional().describe('The VAT rate (MwSt.-Satz or USt.-Satz), e.g., "19%" or "7%".'),
  rechnungspositionen: z.array(InvoiceLineItemSchema).describe('An array of line items (Rechnungspositionen) from the invoice, including productCode, productName, quantity, and unitPrice.'),
  kundenNummer: z.string().optional().describe('The customer number (Kunden-Nr.) if present.'),
  bestellNummer: z.string().optional().describe('The order number (Bestell-Nr., Bestellnummer) if present and distinct from Rechnungsnummer.'),
  isPaid: z.boolean().optional().describe('Whether the invoice is marked as paid ("Bezahlt"). True if paid, false or undefined otherwise.')
});
export type ExtractIncomingInvoiceDataOutput = z.infer<typeof ExtractIncomingInvoiceDataOutputSchema>;

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

  // Normalize common text fields for consistency, even if AI does a good job.
  const normalizedOutput: Partial<ExtractIncomingInvoiceDataOutput> = { ...rawOutput };

  if (normalizedOutput.lieferantName) {
    normalizedOutput.lieferantName = String(normalizedOutput.lieferantName || '').trim().replace(/\n/g, ' ');
  }
  if (normalizedOutput.lieferantAdresse) {
    normalizedOutput.lieferantAdresse = String(normalizedOutput.lieferantAdresse || '').trim().replace(/\n/g, ' ');
  }
  if (normalizedOutput.zahlungsziel) {
    normalizedOutput.zahlungsziel = String(normalizedOutput.zahlungsziel || '').trim().replace(/\n/g, ' ');
  }
   if (normalizedOutput.zahlungsart) {
    normalizedOutput.zahlungsart = String(normalizedOutput.zahlungsart || '').trim().replace(/\n/g, ' ');
  }
  if (normalizedOutput.kundenNummer) {
    normalizedOutput.kundenNummer = String(normalizedOutput.kundenNummer || '').trim();
  }
  if (normalizedOutput.bestellNummer) {
    normalizedOutput.bestellNummer = String(normalizedOutput.bestellNummer || '').trim();
  }


  if (normalizedOutput.rechnungspositionen) {
    normalizedOutput.rechnungspositionen = normalizedOutput.rechnungspositionen.map(item => ({
      ...item,
      productCode: normalizeProductCode(item.productCode),
      productName: String(item.productName || '').trim().replace(/\n/g, ' '),
    }));
  }
  
  return normalizedOutput as ExtractIncomingInvoiceDataOutput;
}

const prompt = ai.definePrompt({
  name: 'extractIncomingInvoiceDataPrompt',
  input: {schema: ExtractIncomingInvoiceDataInputSchema},
  output: {schema: ExtractIncomingInvoiceDataOutputSchema},
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
    *   Extract the supplier's name from the invoice.
    *   Then, try to match the extracted name to an exact name from this valid ERPNext supplier list. Return the ERPNext name if a match is found.
        Valid ERPNext Supplier Names (supplierMap):
        {
          "LIDL": "Lidl",
          "Lidl Digital Deutschland GmbH & Co. KG": "Lidl",
          "GD Artlands eTrading GmbH": "GD Artlands eTrading GmbH",
          "RETOURA": "RETOURA",
          "doitBau GmbH & Co.KG": "doitBau",
          "Kaufland": "Kaufland",
          "ALDI": "ALDI E-Commerce",
          "FIRMA HANDLOWA KABIS BOZENA KEDZIORA": "FIRMA HANDLOWA KABIS BOZENA KEDZIORA",
          "Zweco UG": "Zweco UG"
        }
    *   If the extracted supplier name does not exactly match any key in the list above, return the originally extracted name, or if unsure, return "UNBEKANNT".

4.  Lieferant Adresse (Supplier Address): The full postal address of the supplier. Clean any newline characters.

5.  Zahlungsziel (Payment Terms): e.g., "14 Tage netto", "sofort zahlbar". Clean any newline characters.

6.  Zahlungsart (Payment Method): e.g., "Überweisung", "PayPal", "Sofort", "Lastschrift". Clean any newline characters. If not explicitly mentioned, try to infer it from payment details if possible, or leave it empty.

7.  Gesamtbetrag (Total Amount): The final total amount of the invoice. This should be a numerical value. Parse it carefully.

8.  MwSt.-Satz (VAT Rate): e.g., "19%", "7%". If multiple VAT rates are present and a summary rate is not obvious, this can be omitted or you can list the most prominent one.

9.  Rechnungspositionen (Line Items): A list of all individual items or services. For each item, extract:
    *   productCode (item_code): The product code or article number (e.g., EAN). If not available, leave empty. This should be a plain string.
    *   productName (description): The name or description of the product/service. Clean string.
    *   quantity (qty): The quantity.
    *   unitPrice (rate): The price per unit.

10. KundenNummer (Customer Number): Extract if labeled "Kunden-Nr." or similar.
11. BestellNummer (Order Number): Extract if labeled "Bestell-Nr.", "Bestellnummer", or similar, AND it is clearly distinct from the Rechnungsnummer.
12. isPaid: Determine if the invoice explicitly states it has been paid (e.g., contains the word "Bezahlt"). Set to true if paid, false or undefined otherwise.

Ensure all text fields are extracted as accurately as possible. For numerical fields like Gesamtbetrag, quantity, and unitPrice, provide them as numbers.

Invoice: {{media url=invoiceDataUri}}`,
});

const extractIncomingInvoiceDataFlow = ai.defineFlow(
  {
    name: 'extractIncomingInvoiceDataFlow',
    inputSchema: ExtractIncomingInvoiceDataInputSchema,
    outputSchema: ExtractIncomingInvoiceDataOutputSchema,
  },
  async input => {
    const {output} = await prompt(input, {model: 'googleai/gemini-1.5-flash-latest'});
    return output!; 
  }
);

    