'use server';
/**
 * @fileOverview Normalizes and deduplicates extracted data from PDFs.
 *
 * - normalizeAndDeduplicateData - A function that normalizes and deduplicates data.
 * - NormalizeAndDeduplicateInput - The input type for the normalizeAndDeduplicateData function.
 * - NormalizeAndDeduplicateOutput - The return type for the normalizeAndDeduplicateData function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const ExtractedItemSchema = z.object({
  productCode: z.string().describe('The code of the product.'),
  productName: z.string().describe('The name of the product.'),
  quantity: z.number().describe('The quantity of the product.'),
  unitPrice: z.number().describe('The unit price of the product.'),
});

export type ExtractedItem = z.infer<typeof ExtractedItemSchema>;

const NormalizeAndDeduplicateInputSchema = z.array(ExtractedItemSchema);
export type NormalizeAndDeduplicateInput = z.infer<typeof NormalizeAndDeduplicateInputSchema>;

const NormalizeAndDeduplicateOutputSchema = z.array(ExtractedItemSchema);
export type NormalizeAndDeduplicateOutput = z.infer<typeof NormalizeAndDeduplicateOutputSchema>;

export async function normalizeAndDeduplicateData(
  input: NormalizeAndDeduplicateInput
): Promise<NormalizeAndDeduplicateOutput> {
  return normalizeAndDeduplicateFlow(input);
}

const normalizeAndDeduplicateFlow = ai.defineFlow(
  {
    name: 'normalizeAndDeduplicateFlow',
    inputSchema: NormalizeAndDeduplicateInputSchema,
    outputSchema: NormalizeAndDeduplicateOutputSchema,
  },
  async input => {
    // Normalize data (remove extra spaces, handle inconsistencies)
    const normalizedData = input.map(item => ({
      ...item,
      productCode: item.productCode.trim(),
      productName: item.productName.trim(),
    }));

    // Deduplicate data based on product code
    const uniqueData: ExtractedItem[] = [];
    const productCodes = new Set<string>();

    for (const item of normalizedData) {
      if (!productCodes.has(item.productCode)) {
        uniqueData.push(item);
        productCodes.add(item.productCode);
      }
    }

    return uniqueData;
  }
);
