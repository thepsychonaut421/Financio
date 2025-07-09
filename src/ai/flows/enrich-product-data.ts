
'use server';
/**
 * @fileOverview Enriches raw product names with detailed, structured data.
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
  enrichedTitle: z.string().describe('A clean, SEO-friendly, and attractive title for the product.'),
  summary: z.string().describe('A short, one-paragraph summary of the product.'),
  technicalSpecifications: z.record(z.string()).optional().describe('A key-value object of the main technical specifications found (e.g., {"Power": "550 W", "Capacity": "3.8 L"}).'),
  availabilityAndPricing: z.array(z.object({
      platform: z.string().describe('The platform where the info was found (e.g., eBay, Lidl).'),
      price: z.string().optional().describe('The price found on the platform.'),
      status: z.string().describe('The availability status (e.g., "Available", "Out of Stock").'),
      url: z.string().url().describe('The direct URL to the product page on the platform.')
  })).optional().describe('An array of pricing, availability, and source URLs from different platforms.'),
  suggestedCategories: z.array(z.string()).describe('An array of 2-4 relevant categories or tags for the product.'),
  imageSearchKeywords: z.string().describe('A string containing one or two simple, relevant keywords for searching for a product image.'),
  foundImageUrl: z.string().optional().describe('The direct URL of the product image found by the search tool.'),
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
  prompt: `You are an expert e-commerce catalog manager. Your task is to take a list of raw product names and enrich them using structured data from a search tool.

For each product name in the \`productNames\` array, you MUST:

1.  **CRITICAL FIRST STEP: Use the \`searchProductInfo\` tool.** This tool will provide you with a structured JSON object containing a product title, description, specifications, an array of availability/pricing information from different platforms, and an image URL.

2.  Based on the structured data returned by the tool, generate a refined output. **Your main job is to summarize and categorize, not to parse complex strings.**
    *   **rawProductName**: Copy the original product name here.
    *   **enrichedTitle**: Slightly refine the title from the tool to be clean and attractive.
    *   **summary**: Write a compelling, one-paragraph summary based on the tool's description and specifications.
    *   **technicalSpecifications**: Copy the key-value specifications directly from the tool.
    *   **availabilityAndPricing**: Copy the entire array of availability, pricing, and URL data directly from the tool's result.
    *   **suggestedCategories**: Generate 2-4 relevant categories or tags based on all the information.
    *   **foundImageUrl**: Copy the image URL directly from the tool.
    *   **imageSearchKeywords**: Provide one or two simple keywords for a manual image search (e.g., "kitchen machine").

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
        console.error("Error in enrichProductDataFlow:", e);
        return { enrichedProducts: [], error: "An unexpected error occurred during the enrichment process." };
    }
  }
);
