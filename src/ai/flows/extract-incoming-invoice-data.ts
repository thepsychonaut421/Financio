
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
  rechnungsnummer: z.string().optional().describe('The invoice number (Rechnungsnummer). This must be the number explicitly and clearly labeled as "Rechnungs-Nr.", "Rechnungsnummer", or "Invoice No.". Absolutely do NOT use any number labeled "Bestell-Nr.", "Order Number", "Bestellnummer", "Auftragsnummer", or similar order/customer identifiers. The filename or a generic document title like "Rechnung XXXXX" should NOT be the source for Rechnungsnummer if XXXXX is identified as an order number elsewhere. If no value is explicitly labeled as "Rechnungs-Nr." or "Rechnungsnummer", this field must be left empty.'),
  datum: z.string().optional().describe('The invoice date (Datum), preferably in YYYY-MM-DD or DD.MM.YYYY format. Look for labels like "Rechnungsdatum".'),
  lieferantName: z.string().optional().describe('The name of the supplier (Lieferant).'),
  lieferantAdresse: z.string().optional().describe('The full address of the supplier (Adresse Lieferant).'),
  zahlungsziel: z.string().optional().describe('The payment terms (Zahlungsziel), e.g., "14 Tage netto", "sofort zahlbar".'),
  zahlungsart: z.string().optional().describe('The payment method (Zahlungsart), e.g., "Überweisung", "Sofort", "PayPal", "Lastschrift".'),
  gesamtbetrag: z.number().optional().describe('The total amount of the invoice (Gesamtbetrag) as a numeric value.'),
  mwstSatz: z.string().optional().describe('The VAT rate (MwSt.-Satz or USt.-Satz), e.g., "19%" or "7%".'),
  rechnungspositionen: z.array(InvoiceLineItemSchema).describe('An array of line items (Rechnungspositionen) from the invoice, including productCode, productName, quantity, and unitPrice.')
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
  // Rechnungsnummer and Datum are expected to be extracted more precisely by the AI.
  // Any specific formatting for Datum for ERP is handled client-side.

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
  prompt: `You are an expert AI assistant specialized in extracting detailed information from German invoices (Eingangsrechnungen).
You will receive an invoice as a data URI. Extract the following information meticulously:

- Rechnungsnummer: The unique invoice number. THIS IS CRITICAL. You MUST find the number that is EXPLICITLY labeled "Rechnungs-Nr.", "Rechnungsnummer", "Invoice No.", or a very similar German equivalent for invoice number. IGNORE any numbers labeled as "Bestell-Nr.", "Bestellnummer", "Order Number", "Kunden-Nr.", "Customer Number", "Auftragsnummer", or any other type of reference number. If a document has a title like "Rechnung 12345" but "12345" is also found next to "Bestell-Nr.", then "12345" is NOT the Rechnungsnummer. The Rechnungsnummer MUST have its own distinct "Rechnungs-Nr." or "Rechnungsnummer" label. Do NOT use numbers from the filename. If no clear value is associated with an explicit "Rechnungs-Nr." or "Rechnungsnummer" label, leave this field empty.
- Datum: The date of the invoice. Look for labels like "Rechnungsdatum" or "Invoice Date". Try to provide the date in DD.MM.YYYY format or YYYY-MM-DD format if possible.
- Lieferant Name: The name of the company that issued the invoice (supplier). Ensure this is a clean string.
- Lieferant Adresse: The full postal address of the supplier. Ensure this is a clean string, removing any newline characters.
- Zahlungsziel: The payment terms specified on the invoice (e.g., "14 Tage netto", "sofort zahlbar"). Clean any newline characters.
- Zahlungsart: The payment method specified (e.g., "Überweisung", "PayPal", "Sofort", "Lastschrift"). Clean any newline characters. If not explicitly mentioned, try to infer it from payment details if possible, or leave it empty.
- Gesamtbetrag: The final total amount of the invoice. This should be a numerical value. Parse it carefully, considering currency symbols or thousands separators if present.
- MwSt.-Satz (or USt.-Satz): The Value Added Tax rate applied (e.g., "19%", "7%"). If multiple VAT rates are present for different items and a summary rate is not obvious, this can be omitted or you can list the most prominent one.
- Rechnungspositionen: A list of all individual items or services billed on the invoice. For each item, extract:
    - productCode: The product code or article number. This should be a plain string, avoid scientific notation if it's a long number.
    - productName: The name or description of the product/service. Ensure this is a clean string, removing any newline characters.
    - quantity: The quantity of the product/service.
    - unitPrice: The price per unit of the product/service.

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
    const {output} = await prompt(input);
    // Post-processing for specific fields can be done in the wrapper 'extractIncomingInvoiceData' if needed.
    return output!; 
  }
);

