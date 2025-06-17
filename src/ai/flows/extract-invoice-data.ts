
'use server';

/**
 * @fileOverview An invoice data extraction AI agent.
 *
 * - extractInvoiceData - A function that handles the invoice data extraction process.
 * - ExtractInvoiceDataInput - The input type for the extractInvoiceData function.
 * - ExtractInvoiceDataOutput - The return type for the extractInvoiceData function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';
import type { ExtractedItem } from '@/ai/schemas/invoice-item-schema';


const ExtractInvoiceDataInputSchema = z.object({
  invoiceDataUri: z
    .string()
    .describe(
      "An invoice PDF, as a data URI that must include a MIME type and use Base64 encoding. Expected format: 'data:<mimetype>;base64,<encoded_data>'."
    ),
});
export type ExtractInvoiceDataInput = z.infer<typeof ExtractInvoiceDataInputSchema>;

const ExtractInvoiceDataOutputSchema = z.object({
  invoiceDetails: z.array(
    z.object({
      productCode: z.string().describe('The product code from the invoice. Should be a plain string, avoid scientific notation.'),
      productName: z.string().describe('The name of the product.'),
      quantity: z.number().describe('The quantity of the product.'),
      unitPrice: z.number().describe('The unit price of the product.'),
    })
  ).describe('An array of invoice details extracted from the invoice.')
});
export type ExtractInvoiceDataOutput = z.infer<typeof ExtractInvoiceDataOutputSchema>;


// Helper function for product code normalization
function normalizeProductCode(code: any): string {
  let strCode = String(code || '').trim().replace(/\n/g, ' ');
  // Check if it's in scientific notation (e.g., "1.23e+5", "1.23E-5", "4.335747e+11")
  if (/^[-+]?[0-9]*\.?[0-9]+([eE][-+]?[0-9]+)$/.test(strCode)) {
    const num = Number(strCode);
    if (!isNaN(num) && isFinite(num)) {
      return num.toString();
    }
  }
  return strCode;
}


export async function extractInvoiceData(input: ExtractInvoiceDataInput): Promise<ExtractInvoiceDataOutput> {
  const rawOutput = await extractInvoiceDataFlow(input);

  // Normalize the output
  const normalizedOutput: ExtractInvoiceDataOutput = { invoiceDetails: [] };

  if (rawOutput.invoiceDetails) {
    normalizedOutput.invoiceDetails = rawOutput.invoiceDetails.map((item: any) => ({ // Cast item to any for temp access
      ...item,
      productCode: normalizeProductCode(item.productCode),
      productName: String(item.productName || '').trim().replace(/\n/g, ' '),
      // quantity and unitPrice are numbers
    } as ExtractedItem )); // Cast back to ExtractedItem
  }
  
  return normalizedOutput;
}

const prompt = ai.definePrompt({
  name: 'extractInvoiceDataPrompt',
  input: {schema: ExtractInvoiceDataInputSchema},
  output: {schema: ExtractInvoiceDataOutputSchema},
  prompt: `You are an expert in extracting data from invoices.

You will receive an invoice as a data URI. Extract the following information from the invoice:

- productCode: The product code from the invoice. This should be a plain string of characters and/or digits, exactly as it appears. Avoid scientific notation.
- productName: The name of the product. Ensure this is a clean string.
- quantity: The quantity of the product.
- unitPrice: The unit price of the product.

Return the information as a JSON array of objects under the key "invoiceDetails".

Invoice: {{media url=invoiceDataUri}}`,
});

const extractInvoiceDataFlow = ai.defineFlow(
  {
    name: 'extractInvoiceDataFlow',
    inputSchema: ExtractInvoiceDataInputSchema,
    outputSchema: ExtractInvoiceDataOutputSchema,
  },
  async input => {
    const {output} = await prompt(input, {model: 'googleai/gemini-1.5-flash-latest'});
    // Normalization will be done in the exported wrapper function
    return output!;
  }
);
