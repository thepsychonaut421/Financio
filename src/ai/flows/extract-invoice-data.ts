
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
import { AILineItemSchema, type AppLineItem } from '@/ai/schemas/invoice-item-schema';


const ExtractInvoiceDataInputSchema = z.object({
  invoiceDataUri: z
    .string()
    .describe(
      "An invoice PDF, as a data URI that must include a MIME type and use Base64 encoding. Expected format: 'data:<mimetype>;base64,<encoded_data>'."
    ),
});
export type ExtractInvoiceDataInput = z.infer<typeof ExtractInvoiceDataInputSchema>;

// This schema defines what the AI model is asked to produce.
// Line items use AILineItemSchema which allows for optional quantity/price.
const AIOutputSchema = z.object({
  invoiceDetails: z.array(AILineItemSchema).describe('An array of invoice details extracted from the invoice.')
});

// This type defines what the exported function will return after normalization.
// Line items conform to AppLineItem where quantity/price are required.
export type ExtractInvoiceDataOutput = {
  invoiceDetails: AppLineItem[];
};


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
  const normalizedInvoiceDetails: AppLineItem[] = (rawOutput.invoiceDetails || []).map(item => ({
    productCode: normalizeProductCode(item.productCode),
    productName: String(item.productName || '').trim().replace(/\n/g, ' '),
    quantity: item.quantity === undefined ? 0 : item.quantity, // Default to 0 if undefined
    unitPrice: item.unitPrice === undefined ? 0.0 : item.unitPrice, // Default to 0.0 if undefined
  }));
  
  return { invoiceDetails: normalizedInvoiceDetails };
}

const prompt = ai.definePrompt({
  name: 'extractInvoiceDataPrompt',
  input: {schema: ExtractInvoiceDataInputSchema},
  output: {schema: AIOutputSchema}, // AI generates data according to AILineItemSchema for items
  prompt: `You are an expert in extracting data from invoices.

You will receive an invoice as a data URI. Extract the following information from the invoice:

- productCode: The product code from the invoice. This should be a plain string of characters and/or digits, exactly as it appears. Avoid scientific notation.
- productName: The name of the product. Ensure this is a clean string.
- quantity: The quantity of the product. If not clearly stated, use 0 for quantity.
- unitPrice: The unit price of the product. If not clearly stated, use 0.0 for unitPrice.

Return the information as a JSON array of objects under the key "invoiceDetails".

Invoice: {{media url=invoiceDataUri}}`,
});

const extractInvoiceDataFlow = ai.defineFlow(
  {
    name: 'extractInvoiceDataFlow',
    inputSchema: ExtractInvoiceDataInputSchema,
    outputSchema: AIOutputSchema, // Flow's direct output matches AI's schema
  },
  async input => {
    const {output} = await prompt(input, {model: 'googleai/gemini-1.5-flash-latest'});
    return output!;
  }
);
