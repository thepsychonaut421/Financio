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
import { ExtractedItemSchema as InvoiceLineItemSchema } from '@/ai/flows/normalize-and-deduplicate-data';

const ExtractIncomingInvoiceDataInputSchema = z.object({
  invoiceDataUri: z
    .string()
    .describe(
      "An invoice PDF, as a data URI that must include a MIME type and use Base64 encoding. Expected format: 'data:<mimetype>;base64,<encoded_data>'."
    ),
});
export type ExtractIncomingInvoiceDataInput = z.infer<typeof ExtractIncomingInvoiceDataInputSchema>;

const ExtractIncomingInvoiceDataOutputSchema = z.object({
  rechnungsnummer: z.string().optional().describe('The invoice number (Rechnungsnummer).'),
  datum: z.string().optional().describe('The invoice date (Datum), preferably in YYYY-MM-DD or DD.MM.YYYY format.'),
  lieferantName: z.string().optional().describe('The name of the supplier (Lieferant).'),
  lieferantAdresse: z.string().optional().describe('The full address of the supplier (Adresse Lieferant).'),
  zahlungsziel: z.string().optional().describe('The payment terms (Zahlungsziel), e.g., "14 Tage netto".'),
  gesamtbetrag: z.number().optional().describe('The total amount of the invoice (Gesamtbetrag) as a numeric value.'),
  mwstSatz: z.string().optional().describe('The VAT rate (MwSt.-Satz or USt.-Satz), e.g., "19%" or "7%".'),
  rechnungspositionen: z.array(InvoiceLineItemSchema).describe('An array of line items (Rechnungspositionen) from the invoice, including productCode, productName, quantity, and unitPrice.')
});
export type ExtractIncomingInvoiceDataOutput = z.infer<typeof ExtractIncomingInvoiceDataOutputSchema>;

export async function extractIncomingInvoiceData(input: ExtractIncomingInvoiceDataInput): Promise<ExtractIncomingInvoiceDataOutput> {
  return extractIncomingInvoiceDataFlow(input);
}

const prompt = ai.definePrompt({
  name: 'extractIncomingInvoiceDataPrompt',
  input: {schema: ExtractIncomingInvoiceDataInputSchema},
  output: {schema: ExtractIncomingInvoiceDataOutputSchema},
  prompt: `You are an expert AI assistant specialized in extracting detailed information from German invoices (Eingangsrechnungen).
You will receive an invoice as a data URI. Extract the following information meticulously:

- Rechnungsnummer: The unique invoice number.
- Datum: The date of the invoice. Try to format it as YYYY-MM-DD if possible, otherwise use the format on the invoice.
- Lieferant Name: The name of the company that issued the invoice (supplier).
- Lieferant Adresse: The full postal address of the supplier.
- Zahlungsziel: The payment terms specified on the invoice (e.g., "14 Tage netto", "sofort zahlbar").
- Gesamtbetrag: The final total amount of the invoice. This should be a numerical value. Parse it carefully, considering currency symbols or thousands separators if present.
- MwSt.-Satz (or USt.-Satz): The Value Added Tax rate applied (e.g., "19%", "7%"). If multiple VAT rates are present for different items and a summary rate is not obvious, this can be omitted or you can list the most prominent one.
- Rechnungspositionen: A list of all individual items or services billed on the invoice. For each item, extract:
    - productCode: The product code or article number.
    - productName: The name or description of the product/service.
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
    return output!;
  }
);
