
'use server';
/**
 * @fileOverview Enriches raw product names with titles, descriptions, categories, and image keywords.
 *
 * - enrichProductData - A function that takes a list of raw product names and returns enriched data.
 * - EnrichProductDataInput - The input type for the function.
 * - EnrichProductDataOutput - The return type for the function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { searchProductInfo } from '@/ai/tools/product-search-tool';

const EnrichProductDataInputSchema = z.object({
  productNames: z.array(z.string()).describe('An array of raw product names to be enriched.'),
});
export type EnrichProductDataInput = z.infer<typeof EnrichProductDataInputSchema>;

const EnrichedProductSchema = z.object({
  rawProductName: z.string().describe('The original, raw product name that was provided.'),
  enrichedTitle: z.string().describe('A clean, SEO-friendly, and attractive title for the product. Should be concise.'),
  enrichedDescription: z.string().describe('A compelling and detailed product description suitable for an e-commerce platform. This should be based on information found online.'),
  suggestedCategories: z.array(z.string()).describe('An array of 2-4 relevant categories or tags for the product.'),
  imageSearchKeywords: z.string().describe('A string containing one or two simple, relevant keywords for searching for a product image (e.g., "laptop stand" or "blue t-shirt"). This is for automated image searches.'),
  foundImageUrl: z.string().optional().describe('The direct URL of the product image found by the search tool.'),
  source: z.string().optional().describe('The source URL where the product information was found.'),
});

const EnrichProductDataOutputSchema = z.object({
  enrichedProducts: z.array(EnrichedProductSchema).describe('An array of enriched product data objects.'),
  error: z.string().optional().describe('An error message if the operation failed.'),
});
export type EnrichProductDataOutput = z.infer<typeof EnrichProductDataOutputSchema>;


export async function enrichProductData(input: EnrichProductDataInput): Promise<EnrichProductDataOutput> {
  return enrichProductDataFlow(input);
}

const prompt = ai.definePrompt({
  name: 'enrichProductDataPrompt',
  input: { schema: EnrichProductDataInputSchema },
  output: { schema: EnrichProductDataOutputSchema },
  tools: [searchProductInfo],
  prompt: `You are an expert e-commerce catalog manager. Your task is to take a list of raw, often messy, product names and enrich them with high-quality data suitable for an online store.

For each product name provided in the \`productNames\` array, you MUST perform the following steps:

1.  **CRITICAL FIRST STEP: Use the \`searchProductInfo\` tool** to find real information about the product on the web. This will give you a real description and an image URL.

2.  Based on the information returned by the tool, generate the following fields:
    *   **enrichedTitle**: Create a clean, catchy, and SEO-friendly title.
    *   **enrichedDescription**: Write a compelling product description based on the details found by the tool. Make it appealing to customers.
    *   **suggestedCategories**: Provide an array of 2 to 4 relevant categories or tags.
    *   **foundImageUrl**: The image URL returned by the tool.
    *   **source**: The source URL returned by the tool.
    *   **imageSearchKeywords**: As a fallback, provide a string with one or two simple keywords for a manual image search (e.g., "wireless mouse").

Process every single product name from the input array.

Raw Product Names:
{{{json productNames}}}
`,
});

const enrichProductDataFlow = ai.defineFlow(
  {
    name: 'enrichProductDataFlow',
    inputSchema: EnrichProductDataInputSchema,
    outputSchema: EnrichProductDataOutputSchema,
  },
  async (input) => {
    try {
      const { output } = await prompt(input);
      return output || { enrichedProducts: [] };
    } catch (e: any) {
        if (e.message && (e.message.includes('503') || e.message.includes('overloaded'))) {
            return { enrichedProducts: [], error: "The AI service is currently busy or unavailable. Please try again in a few moments." };
        }
        return { enrichedProducts: [], error: "An unexpected error occurred during the enrichment process." };
    }
  }
);
