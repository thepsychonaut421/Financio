'use server';
/**
 * @fileOverview Normalizes and deduplicates extracted data from PDFs.
 *
 * - normalizeAndDeduplicateData - A function that normalizes and deduplicates data.
 * - NormalizeAndDeduplicateInput - The input type for the normalizeAndDeduplicateData function.
 * - NormalizeAndDeduplicateOutput - The return type for the normalizeAndDequplicateData function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';
import { ProcessedLineItemSchema, type AppLineItem } from '@/ai/schemas/invoice-item-schema';

const NormalizeAndDeduplicateInputSchema = z.array(ProcessedLineItemSchema);
export type NormalizeAndDeduplicateInput = z.infer<typeof NormalizeAndDeduplicateInputSchema>;

const NormalizeAndDeduplicateOutputSchema = z.array(ProcessedLineItemSchema);
export type NormalizeAndDeduplicateOutput = z.infer<typeof NormalizeAndDeduplicateOutputSchema>;

// Helper function for product code normalization (can be shared or defined locally)
function normalizeProductCode(code: any): string {
  let strCode = String(code || '').trim().replace(/\n/g, ' ');
  // Check if it's in scientific notation (e.g., "1.23e+5", "1.23E-5", "4.335747e+11")
  if (/^[-+]?[0-9]*\.?[0-9]+([eE][-+]?[0-9]+)?$/.test(strCode)) {
    const num = Number(strCode);
    if (!isNaN(num) && isFinite(num)) {
      return num.toString();
    }
  }
  return strCode;
}

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
  async (input: NormalizeAndDeduplicateInput): Promise<NormalizeAndDeduplicateOutput> => {
    // Normalize data (remove extra spaces, handle inconsistencies, clean newlines)
    const normalizedData = input.map(item => ({
      ...item,
      productCode: normalizeProductCode(item.productCode),
      productName: String(item.productName || '').trim().replace(/\n/g, ' '),
    }));

    // Deduplicate data based on product code
    const uniqueData: AppLineItem[] = [];
    const productCodes = new Set<string>();

    for (const item of normalizedData) {
      if (item.productCode && !productCodes.has(item.productCode)) {
        uniqueData.push(item);
        productCodes.add(item.productCode);
      } else if (!item.productCode) { 
        // If product code is empty/null, we might still want to include the item
        // or handle it based on other criteria. For now, include if no code.
        uniqueData.push(item);
      }
    }

    return uniqueData;
  }
);
