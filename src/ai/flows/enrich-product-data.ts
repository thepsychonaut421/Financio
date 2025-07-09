
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

const EnrichProductDataInputSchema = z.object({
  productNames: z.array(z.string()).describe('An array of raw product names to be enriched.'),
});
export type EnrichProductDataInput = z.infer<typeof EnrichProductDataInputSchema>;

const EnrichedProductSchema = z.object({
  rawProductName: z.string().describe('The original, raw product name that was provided.'),
  enrichedTitle: z.string().describe('A clean, SEO-friendly, and attractive title for the product. Should be concise.'),
  enrichedDescription: z.string().describe('A compelling and detailed product description suitable for an e-commerce platform.'),
  suggestedCategories: z.array(z.string()).describe('An array of 2-4 relevant categories or tags for the product.'),
  imageSearchKeywords: z.string().describe('A string containing one or two simple, relevant keywords for searching for a product image (e.g., "laptop stand" or "blue t-shirt"). This will be used for automated image searches.'),
});

const EnrichProductDataOutputSchema = z.object({
  enrichedProducts: z.array(EnrichedProductSchema).describe('An array of enriched product data objects.'),
});
export type EnrichProductDataOutput = z.infer<typeof EnrichProductDataOutputSchema>;


export async function enrichProductData(input: EnrichProductDataInput): Promise<EnrichProductDataOutput> {
  return enrichProductDataFlow(input);
}

const prompt = ai.definePrompt({
  name: 'enrichProductDataPrompt',
  input: { schema: EnrichProductDataInputSchema },
  output: { schema: EnrichProductDataOutputSchema },
  prompt: `You are an expert e-commerce catalog manager. Your task is to take a list of raw, often messy, product names and enrich them with high-quality data suitable for an online store.

For each product name provided in the \`productNames\` array, you must generate the following:

1.  **enrichedTitle**: A clean, catchy, and SEO-friendly title. It should be clear and concise.
2.  **enrichedDescription**: A compelling product description. Highlight key features and benefits. Write in a tone that is appealing to customers.
3.  **suggestedCategories**: Provide an array of 2 to 4 relevant categories or tags. Think about how a user might search for this item.
4.  **imageSearchKeywords**: CRITICAL - Provide a string containing just one or two simple keywords that can be used to find a generic, high-quality stock photo of the product. Examples: "wireless mouse", "leather wallet", "ceramic mug". This is for an automated image search, so keep it simple and direct.

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
          throw new Error("The AI service is currently busy or unavailable. Please try again in a few moments.");
      }
      throw e;
    }
  }
);
